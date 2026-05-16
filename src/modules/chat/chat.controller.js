import { GoogleGenerativeAI } from '@google/generative-ai';
import handleAsync from '../../utils/handleAsync.js';
import createResponse from '../../utils/responses.js';
import createError from '../../utils/error.js';
import { Court, CourtAmenity } from '../courts/court.models.js';
import Equipment from '../equipments/equipment.models.js';

export const handleChat = handleAsync(async (req, res, next) => {
    const { message, history } = req.body;

    if (!message) {
        return next(createError(400, 'Vui lòng cung cấp nội dung tin nhắn'));
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'dummy_key') {
        return next(createError(500, 'GEMINI_API_KEY chưa được cấu hình hoặc không hợp lệ. Vui lòng thêm vào file .env'));
    }

    // Khởi tạo Gemini bên trong handler để đảm bảo lấy được giá trị .env mới nhất
    const genAI = new GoogleGenerativeAI(apiKey);

    // Lấy dữ liệu ngữ cảnh (Sân và Thiết bị)
    // Tìm tất cả các sân và thiết bị đang hoạt động hoặc có sẵn
    const courts = await Court.find({ status: 'active' }).select('_id name type basePrice peakPrice location formats description').lean();
    const equipments = await Equipment.find({ status: 'in_stock' }).select('name rentPrice salePrice status inStock isStock availableQuantity unit mode').lean();

    // Dự phòng nếu giá trị trạng thái khác nhau
    const courtsList = courts.length > 0 ? courts : await Court.find({}).select('_id name type basePrice peakPrice location formats status description').lean();
    const equipmentsList = equipments.length > 0 ? equipments : await Equipment.find({}).select('name rentPrice salePrice status availableQuantity unit mode').lean();

    // Lấy các tiện ích cho sân
    const amenities = await CourtAmenity.find({}).lean();
    const amenitiesByCourt = {};
    amenities.forEach(amenity => {
        const cId = amenity.courtId.toString();
        if (!amenitiesByCourt[cId]) amenitiesByCourt[cId] = [];
        amenitiesByCourt[cId].push(amenity.name);
    });

    // Định dạng ngữ cảnh cho AI
    const courtsText = courtsList.map(c => {
        const courtAmenities = amenitiesByCourt[c._id.toString()] || [];
        return `- Sân: ${c.name}, Thể loại: ${c.formats || 'Sân 5/7'}, Giá cơ bản: ${c.basePrice?.toLocaleString('vi-VN')}đ, Giá cao điểm: ${c.peakPrice?.toLocaleString('vi-VN')}đ, Vị trí: ${c.location || 'N/A'}, Tiện ích: ${courtAmenities.length > 0 ? courtAmenities.join(', ') : 'Không có'}, Mô tả thêm: ${c.description || 'Không'}`;
    }).join('\n');
    const equipmentsText = equipmentsList.map(e => {
        let priceText = '';
        if (e.mode === 'sell') {
            priceText = `Giá bán: ${e.salePrice?.toLocaleString('vi-VN')}đ (Chỉ bán)`;
        } else if (e.mode === 'rent') {
            priceText = `Giá thuê: ${e.rentPrice?.toLocaleString('vi-VN')}đ (Chỉ thuê)`;
        } else {
            priceText = `Giá thuê: ${e.rentPrice?.toLocaleString('vi-VN')}đ, Giá bán: ${e.salePrice?.toLocaleString('vi-VN')}đ (Có thể thuê hoặc mua)`;
        }
        return `- Thiết bị: ${e.name}, ${priceText}, Kho: ${e.availableQuantity || 0} ${e.unit || 'cái'}`;
    }).join('\n');

    const systemPrompt = `Bạn là nhân viên tư vấn nhiệt tình của sân bóng đá. Tên bạn là AI-Coach. Nhiệm vụ của bạn là tư vấn cho khách hàng về việc thuê sân và thiết bị. 
Dưới đây là thông tin hiện tại của các sân và thiết bị tại hệ thống của chúng tôi:

### DANH SÁCH SÂN:
${courtsText || 'Hiện chưa có thông tin sân.'}

### DANH SÁCH THIẾT BỊ:
${equipmentsText || 'Hiện chưa có thông tin thiết bị.'}

Hãy trả lời khách hàng một cách lịch sự, thân thiện, ngắn gọn và dễ hiểu. Chỉ tư vấn dựa trên thông tin được cung cấp ở trên.
Nếu khách hàng hỏi những vấn đề không liên quan đến đặt sân, bóng đá, hoặc thiết bị, hãy từ chối khéo léo.
Không bịa đặt thông tin.

Yêu cầu định dạng:
- Trả lời bằng tiếng Việt.
- Dùng markdown để format (in đậm, danh sách) cho dễ đọc.
- Giữ câu trả lời súc tích.`;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Chuyển đổi định dạng lịch sử nếu được cung cấp
        const formattedHistory = Array.isArray(history) ? history.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content || h.text }]
        })) : [];

        // Thêm system prompt như là chỉ thị đầu tiên
        const chatSession = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: "Hãy đọc và ghi nhớ chỉ thị sau:\n" + systemPrompt }]
                },
                {
                    role: "model",
                    parts: [{ text: "Tôi đã hiểu nhiệm vụ và thông tin hệ thống. Tôi sẵn sàng tư vấn cho khách hàng." }]
                },
                ...formattedHistory
            ],
            generationConfig: {
                maxOutputTokens: 1000,
                temperature: 0.7,
            },
        });

        const result = await chatSession.sendMessage(message);
        const text = result.response.text();

        return res.status(200).json(
            createResponse(true, 200, 'Tư vấn thành công', {
                reply: text
            })
        );
    } catch (error) {
        return next(createError(500, 'Lỗi khi kết nối với AI tư vấn. Vui lòng thử lại sau. Chi tiết lỗi: ' + error.message));
    }
});
