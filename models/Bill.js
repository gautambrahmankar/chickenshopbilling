const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  name: String,
  price: Number,
  unit: String,
  quantity: { type: Number, min: 0 },
  subtotal: Number
}, { _id: false });

const billSchema = new mongoose.Schema({
  billNumber: {
    type: String,
    unique: true
  },
  customerName: {
    type: String,
    default: 'Walk-in Customer',
    trim: true
  },
  customerPhone: {
    type: String,
    trim: true,
    default: ''
  },
  items: [billItemSchema],
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },     // absolute rupee discount
  discountPercent: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  paid: { type: Boolean, default: true }
}, { timestamps: true });

// Auto-generate bill number before saving
billSchema.pre('save', async function(next) {
  if (!this.billNumber) {
    const count = await mongoose.model('Bill').countDocuments();
    const date = new Date();
    const prefix = `JSC${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}`;
    this.billNumber = `${prefix}${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Bill', billSchema);
