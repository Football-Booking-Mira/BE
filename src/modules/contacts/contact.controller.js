import Contact from "./contact.models.js";

const ContactController = {
  // USER gửi liên hệ
  create: async (req, res) => {
    try {
      const { name, email, phone, message } = req.body;

      // 1️⃣ Bắt buộc nhập
      if (!name || !email || !phone || !message) {
        return res.status(400).json({
          message: "Vui lòng điền đầy đủ thông tin liên hệ",
        });
      }

      // 2️⃣ Validate email (phải có @)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          message: "Email không hợp lệ",
        });
      }

      // 3️⃣ Validate số điện thoại (bắt đầu bằng 0, đủ 10 số)
      const phoneRegex = /^0\d{9}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({
          message: "Số điện thoại phải bắt đầu bằng 0 và đủ 10 chữ số",
        });
      }

      // 4️⃣ Lưu DB
      const contact = await Contact.create({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        message: message.trim(),
      });

      return res.status(201).json({
        message: "Gửi liên hệ thành công",
        data: contact,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Lỗi server" });
    }
  },

  // ADMIN xem danh sách liên hệ
  getAll: async (req, res) => {
    try {
      const contacts = await Contact.find().sort({ createdAt: -1 });
      res.json(contacts);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  },
};

export default ContactController;
