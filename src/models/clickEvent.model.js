import mongoose from "mongoose";

const clickEventSchema = new mongoose.Schema(
  {
    urlId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Url",
      required: true,
      index: true,
    },
    clickedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    referrer: {
      type: String,
      default: null,
      maxlength: 2048,
    },
    userAgent: {
      type: String,
      default: null,
      maxlength: 512,
    },
  },
  { versionKey: false },
);

clickEventSchema.index({ urlId: 1, clickedAt: -1 });

const ClickEvent = mongoose.model("ClickEvent", clickEventSchema);

export default ClickEvent;
