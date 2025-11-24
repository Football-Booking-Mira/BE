import mongoose from 'mongoose';

const {
    Schema,
    Types: { ObjectId },
} = mongoose;

// Enum cho role và status
const ROLE_ENUM = ['admin', 'user'];
const USER_STATUS_ENUM = ['active', 'inactive', 'banned'];

const UserSchema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        phone: { type: String, trim: true },
        email: { type: String, unique: true, sparse: true, trim: true },
        password: { type: String, required: false, select: false },
        role: { type: String, enum: ROLE_ENUM, default: 'user' },
        status: { type: String, enum: USER_STATUS_ENUM, default: 'inactive' },
        avatar: { type: String, default: '' },
        isEmailVerified: { type: Boolean, default: false },
        verificationToken: { type: String },
        verificationTokenExpires: { type: Date },
        resetPasswordToken: { type: String },
        resetPasswordExpires: { type: Date },
    },
    {
        timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    }
);

// 🔍 Index tối ưu tìm kiếm
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });

const User = mongoose.model('User', UserSchema);
export default User;
