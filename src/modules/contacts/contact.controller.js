import Contact from "./contact.models.js";

const ContactController = {
  // USER gửi liên hệ
  create: async (req, res) => {
    try {
      const { name, email, phone, message } = req.body;

      if (!name || !email || !phone || !message) {
        return res.status(400).json({
          message: "Thiếu thông tin liên hệ",
        });
      }

      const contact = await Contact.create({
        name,
        email,
        phone,
        message,
      });

      res.json({
        message: "Gửi liên hệ thành công",
        data: contact,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  },

  // ADMIN xem danh sách liên hệ
  getAll: async (req, res) => {
    try {
      const contacts = await Contact.find().sort({ createdAt: -1 });
      res.json(contacts); // ⚠️ PHẢI LÀ ARRAY
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  },
};

export default ContactController;
