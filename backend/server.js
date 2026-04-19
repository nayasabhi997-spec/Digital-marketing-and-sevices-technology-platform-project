require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const { OpenAI } = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the current directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/digitech')
    .then(() => console.log('Successfully connected to MongoDB'))
    .catch((err) => console.error('MongoDB connection error:', err));

// Mongoose Schemas & Models
const requestSchema = new mongoose.Schema({
    name: { type: String, required: true },
    service: { type: String, required: true },
    budget: { type: String, required: true },
    status: { type: String, default: 'New' },
    date: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    business: { type: String },
    message: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Simple plaintext for local dev
    projectProgress: { 
        type: [{ step: Number, status: String }], 
        default: [
            { step: 0, status: 'completed' }, 
            { step: 1, status: 'completed' },
            { step: 2, status: 'in-progress' },
            { step: 3, status: 'pending' },
            { step: 4, status: 'pending' }
        ] 
    },
    createdAt: { type: Date, default: Date.now }
});

const Request = mongoose.model('Request', requestSchema);
const Message = mongoose.model('Message', messageSchema);
const User = mongoose.model('User', userSchema);

/* ================== API ROUTES ================== */

// Default route
app.get('/', (req, res) => {
    res.send('DigiTech Connect Backend is running with MongoDB!');
});

// 1. Get all requests
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await Request.find().sort({ date: -1 });
        res.status(200).json(requests);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Failed to retrieve requests' });
    }
});

// 2. Create a new request (Lead)
app.post('/api/requests', async (req, res) => {
    try {
        const { name, service, budget } = req.body;
        
        if (!name || !service || !budget) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const newRequest = new Request({ name, service, budget });
        await newRequest.save();

        res.status(201).json({ message: 'Request created successfully', request: newRequest });
    } catch (error) {
        console.error('Error creating request:', error);
        res.status(500).json({ error: 'Failed to create request' });
    }
});

// 3. Submit a contact message
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, business, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const newMessage = new Message({ name, email, business, message });
        await newMessage.save();

        res.status(201).json({ message: 'Message sent successfully', data: newMessage });
    } catch (error) {
        console.error('Error saving message:', error);
        res.status(500).json({ error: 'Failed to submit message' });
    }
});

// 4. Register new user
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Missing all fields' });
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const newUser = new User({ name, email, password });
        await newUser.save();

        res.status(201).json({ message: 'Account created successfully', user: { name: newUser.name, email: newUser.email } });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

// 5. Login user
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Missing email or password' });
        }
        
        // Find user by email and password
        const user = await User.findOne({ email, password });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.status(200).json({ 
            message: 'Login successful', 
            user: { 
                name: user.name, 
                email: user.email, 
                projectProgress: user.projectProgress
            } 
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'Failed to login' });
    }
});

// 6. AI Chat Proxy
app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;

        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_actual_key_here') {
            return res.status(500).json({ error: 'OpenAI API Key is missing in the backend .env file' });
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: messages,
            max_tokens: 500,
            temperature: 0.7,
        });

        res.status(200).json(completion.choices[0].message);
    } catch (error) {
        console.error('OpenAI Error:', error);
        res.status(500).json({ error: error.message || 'Failed to communicate with OpenAI' });
    }
});

// 7. Update request status (Progress)
app.patch('/api/requests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const updatedRequest = await Request.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!updatedRequest) {
            return res.status(404).json({ error: 'Request not found' });
        }

        res.status(200).json({ message: 'Status updated', request: updatedRequest });
    } catch (error) {
        console.error('Error updating request:', error);
        res.status(500).json({ error: 'Failed to update request' });
    }
});

// 7. Get Stats (Dynamic)
app.get('/api/stats', async (req, res) => {
    handleGetStats(req, res);
});

app.get('/api/stats/:email', async (req, res) => {
    handleGetStats(req, res);
});

async function handleGetStats(req, res) {
    try {
        const email = req.params.email;
        const totalLeads = await Request.countDocuments();
        const activeCampaigns = await Request.countDocuments({ status: { $in: ['In Progress', 'Interested'] } });
        
        const completedRequests = await Request.find({ status: 'Completed' });
        const revenue = completedRequests.reduce((sum, req) => {
            const amount = parseInt(req.budget.replace(/[^0-9]/g, '')) || 0;
            return sum + amount;
        }, 0);

        let websiteProgress = 75;
        if (email) {
            const user = await User.findOne({ email });
            if (user && user.projectProgress) {
                let completed = 0;
                user.projectProgress.forEach(s => {
                    if (s.status === 'completed') completed += 2;
                    else if (s.status === 'in-progress') completed += 1;
                });
                websiteProgress = Math.round((completed / (5 * 2)) * 100);
            }
        }

        res.status(200).json({
            totalLeads,
            activeCampaigns,
            websiteProgress,
            revenue
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
}

// 8. Update User Progress
app.patch('/api/user/progress', async (req, res) => {
    try {
        const { email, progress } = req.body;
        if (!email || !progress) {
            return res.status(400).json({ error: 'Email and progress data required' });
        }
        
        const user = await User.findOneAndUpdate({ email }, { projectProgress: progress }, { new: true });
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.status(200).json({ message: 'Progress updated', progress: user.projectProgress });
    } catch (error) {
        console.error('Progress update error:', error);
        res.status(500).json({ error: 'Failed to update progress' });
    }
});

// 9. Get User Progress
app.get('/api/user/progress/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.status(200).json({ progress: user.projectProgress });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch progress' });
    }
});

// 8. Forgot Password
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Please enter your email' });
        }
        
        const user = await User.findOne({ email });
        if (!user) {
            // we pretend it succeeded even if they don't exist to prevent enum attack
            return res.status(200).json({ message: 'If an account exists, a reset link was sent' });
        }

        // Normally we would send an email here
        res.status(200).json({ message: 'Password reset link sent to your email successfully' });
    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Backend server successfully running at http://localhost:${PORT}`);
});

