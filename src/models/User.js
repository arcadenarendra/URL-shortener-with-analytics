import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      // bcrypt hashes are always 60 chars; anything else means a bad hash.
      match: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/,
      select: false,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return { id: this._id.toString(), email: this.email, createdAt: this.createdAt };
};

const User = mongoose.model('User', userSchema);
export default User;
