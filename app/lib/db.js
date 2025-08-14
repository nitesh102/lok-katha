import mongoose from "mongoose"

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable inside .env.local")
}

let cached = global.mongoose

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null }
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    }

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose
    })
  }

  try {
    cached.conn = await cached.promise
  } catch (e) {
    cached.promise = null
    throw e
  }

  return cached.conn
}

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  institution: { type: String },
  createdAt: { type: Date, default: Date.now },
})

// Tale Schema
const taleSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 100 },
  story: { type: String, required: true, maxlength: 5000 },
  culturalContext: { type: String, maxlength: 1000 },
  region: {
    type: String,
    required: true,
    enum: ["Himalayan", "Kathmandu Valley", "Terai", "Mid-Hills"],
  },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  imageUrl: { type: String },
  audioUrl: { type: String },
  isPublic: { type: Boolean, default: true },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

// Analytics Schema
const analyticsSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'tale_view', 'map_interaction', etc.
  taleId: { type: mongoose.Schema.Types.ObjectId, ref: "Tale" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  metadata: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now },
})

// Create models
const User = mongoose.models.User || mongoose.model("User", userSchema)
const Tale = mongoose.models.Tale || mongoose.model("Tale", taleSchema)
const Analytics = mongoose.models.Analytics || mongoose.model("Analytics", analyticsSchema)

// Database functions
export async function createUser(userData) {
  await connectDB()
  const user = new User(userData)
  return await user.save()
}

export async function getUserByEmail(email) {
  await connectDB()
  return await User.findOne({ email }).lean()
}

export async function getUserById(id) {
  await connectDB()
  return await User.findById(id).lean()
}

export async function createTale(taleData) {
  await connectDB()
  const tale = new Tale(taleData)
  return await tale.save()
}

export async function getTaleById(id) {
  await connectDB()
  return await Tale.findById(id).populate("author", "name email institution").lean()
}

export async function updateTale(id, updateData) {
  await connectDB()
  updateData.updatedAt = new Date()
  return await Tale.findByIdAndUpdate(id, updateData, { new: true }).populate("author", "name email institution").lean()
}

export async function deleteTale(id) {
  await connectDB()
  return await Tale.findByIdAndDelete(id)
}

export async function getPublicTales(limit = 10, page = 1, filters = {}) {
  await connectDB()

  const query = { isPublic: true }

  if (filters.search) {
    query.$or = [
      { title: { $regex: filters.search, $options: "i" } },
      { story: { $regex: filters.search, $options: "i" } },
    ]
  }

  if (filters.region) {
    query.region = filters.region
  }

  const skip = (page - 1) * limit

  return await Tale.find(query).populate("author", "name").sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
}

export async function getUserTales(userId) {
  await connectDB()
  return await Tale.find({ author: userId }).populate("author", "name").sort({ createdAt: -1 }).lean()
}

export async function getTalesCount() {
  await connectDB()
  return await Tale.countDocuments({ isPublic: true })
}

export async function incrementTaleViews(taleId) {
  await connectDB()
  await Tale.findByIdAndUpdate(taleId, { $inc: { views: 1 } })

  // Record analytics
  const analytics = new Analytics({
    type: "tale_view",
    taleId: taleId,
    timestamp: new Date(),
  })
  await analytics.save()
}

export async function recordAnalytics(type, data) {
  await connectDB()
  const analytics = new Analytics({
    type,
    ...data,
    timestamp: new Date(),
  })
  return await analytics.save()
}

export { User, Tale, Analytics }
