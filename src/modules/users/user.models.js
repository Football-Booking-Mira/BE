import mongoose from 'mongoose';

const {
    Schema,
} = mongoose;

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
        verificationToken: { type: String, select: false },
        verificationTokenExpires: { type: Date, select: false },
        resetPasswordToken: { type: String, select: false },
        resetPasswordExpires: { type: Date, select: false },
    },
    {
        timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    }
);

UserSchema.index({ phone: 1 });

const User = mongoose.model('User', UserSchema);
export default User;
