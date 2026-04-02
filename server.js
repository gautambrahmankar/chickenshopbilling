require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const Item = require('./models/Item');
const Bill = require('./models/Bill');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── MongoDB Connection ────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    await seedDefaultItems();
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

async function seedDefaultItems() {
  const count = await Item.countDocuments();
  if (count === 0) {
    await Item.insertMany([
      { name: 'Full Chicken', price: 280, unit: 'per kg', category: 'Whole Bird' },
      { name: 'Chicken Breast', price: 320, unit: 'per kg', category: 'Cuts' },
      { name: 'Chicken Legs', price: 260, unit: 'per kg', category: 'Cuts' },
      { name: 'Chicken Wings', price: 240, unit: 'per kg', category: 'Cuts' },
      { name: 'Chicken Curry Cut', price: 290, unit: 'per kg', category: 'Cuts' },
      { name: 'Boneless Chicken', price: 380, unit: 'per kg', category: 'Boneless' },
      { name: 'Chicken Mince', price: 300, unit: 'per kg', category: 'Minced' },
      { name: 'Chicken Liver', price: 180, unit: 'per kg', category: 'Offal' },
    ]);
    console.log('🐔 Seeded default chicken items');
  }
}

// ─── ITEM ROUTES ───────────────────────────────────────────────────────────────

// GET all items
app.get('/api/items', async (req, res) => {
  try {
    const items = await Item.find().sort({ category: 1, name: 1 });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create item
app.post('/api/items', async (req, res) => {
  try {
    const item = new Item(req.body);
    await item.save();
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT update item
app.put('/api/items/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE item
app.delete('/api/items/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── BILL ROUTES ───────────────────────────────────────────────────────────────

// GET all bills (paginated)
app.get('/api/bills', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const bills = await Bill.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Bill.countDocuments();
    res.json({ success: true, data: bills, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single bill
app.get('/api/bills/:id', async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    res.json({ success: true, data: bill });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create bill
app.post('/api/bills', async (req, res) => {
  try {
    const { customerName, customerPhone, items, discountPercent } = req.body;

    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const discPct = parseFloat(discountPercent) || 0;
    const discount = Math.round(subtotal * discPct / 100);
    const total = subtotal - discount;

    const bill = new Bill({
      customerName: customerName || 'Walk-in Customer',
      customerPhone: customerPhone || '',
      items,
      subtotal,
      discountPercent: discPct,
      discount,
      total
    });

    await bill.save();
    res.status(201).json({ success: true, data: bill });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE bill
app.delete('/api/bills/:id', async (req, res) => {
  try {
    const bill = await Bill.findByIdAndDelete(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    res.json({ success: true, message: 'Bill deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── STATS ROUTES ──────────────────────────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const now = new Date();
    let startDate, endDate = now;
    let groupFormat;

    if (period === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      groupFormat = '%H:00';
    } else if (period === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      groupFormat = '%Y-%m-%d';
    } else if (period === 'yearly') {
      startDate = new Date(now.getFullYear(), 0, 1);
      groupFormat = '%Y-%m';
    }

    // Total sales & bills in period
    const periodStats = await Bill.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalBills: { $sum: 1 },
          totalDiscount: { $sum: '$discount' }
        }
      }
    ]);

    // Sales chart data
    const chartData = await Bill.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
          revenue: { $sum: '$total' },
          bills: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Top items sold in period
    const topItems = await Bill.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.name',
          totalQty: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 5 }
    ]);

    // All time stats
    const allTimeStats = await Bill.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalBills: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period,
        summary: periodStats[0] || { totalRevenue: 0, totalBills: 0, totalDiscount: 0 },
        chartData,
        topItems,
        allTime: allTimeStats[0] || { totalRevenue: 0, totalBills: 0 }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Jayshree Billing Server running on http://localhost:${PORT}`);
});
