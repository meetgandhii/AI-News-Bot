// index.js - Complete Final Code
require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const RSSParser = require('rss-parser');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { summarizeWithAI } = require('./ai-summarizer');
const { fetchArticleContent, filterAIAndSoftwareArticles } = require('./content-fetcher');

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
            scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
        },
    },
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting with enhanced tracking
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => {
        sendSecurityAlert('RATE_LIMIT_HIT', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.path,
            timestamp: new Date().toISOString()
        });
        res.status(429).json({ error: 'Rate limit exceeded' });
    }
});

// Store current QR code for web interface
let currentQR = null;
let isConnected = false;

// Generate secure session encryption key
const SESSION_KEY = process.env.SESSION_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

// Authorized users (admin privileges)
const AUTHORIZED_NUMBERS = process.env.AUTHORIZED_NUMBERS ?
    process.env.AUTHORIZED_NUMBERS.split(',').map(num => num.trim().replace(/\D/g, '')) :
    [process.env.YOUR_PHONE_NUMBER.replace(/\D/g, '')];

// WhatsApp mailing list (receives daily summaries)
const WHATSAPP_MAILING_LIST = process.env.WHATSAPP_MAILING_LIST ?
    process.env.WHATSAPP_MAILING_LIST.split(',').map(num => num.trim().replace(/\D/g, '')) :
    AUTHORIZED_NUMBERS;

// Admin number for security alerts (first authorized number)
const ADMIN_NUMBER = AUTHORIZED_NUMBERS[0];

// Security: Enhanced WhatsApp client that works on Railway
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './whatsapp-session',
        clientId: crypto.createHash('sha256').update(SESSION_KEY).digest('hex').substring(0, 16)
    }),
    puppeteer: {
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI,VizDisplayCompositor',
            '--disable-extensions',
            '--disable-default-apps',
            '--mute-audio',
            '--no-default-browser-check',
            '--autoplay-policy=user-gesture-required',
            '--disable-background-networking',
            '--disable-sync',
            '--hide-scrollbars',
            '--disable-ipc-flooding-protection',
        ],
        ignoreDefaultArgs: ['--disable-extensions'],
    }
});

const parser = new RSSParser({
    customFields: {
        item: ['content:encoded', 'description']
    }
});

// Security: Function to send real-time security alerts via WhatsApp
async function sendSecurityAlert(alertType, details) {
    const timestamp = new Date().toISOString();
    const maskedPhone = details.phoneNumber ?
        details.phoneNumber.replace(/(\d{2})\d{6}(\d{4})/, '$1******$2') : 'Unknown';

    const alertMessage = `🚨 *SECURITY ALERT*\n\n` +
        `⚠️ *Type:* ${alertType}\n` +
        `📱 *Phone:* ${maskedPhone}\n` +
        `🌐 *IP:* ${details.ip || 'Unknown'}\n` +
        `🕒 *Time:* ${new Date().toLocaleString()}\n` +
        `📋 *Action:* ${details.action || 'Suspicious activity'}\n` +
        `🔍 *User Agent:* ${details.userAgent ? details.userAgent.substring(0, 50) + '...' : 'Unknown'}\n\n` +
        `_🤖 Automated security alert by Meet Gandhi's Bot_`;

    try {
        if (client.info && client.info.wid) {
            const adminChatId = ADMIN_NUMBER + '@c.us';
            await client.sendMessage(adminChatId, alertMessage);
            secureLog('info', 'Security alert sent via WhatsApp to admin');
        }
    } catch (error) {
        secureLog('error', 'Failed to send WhatsApp security alert', { error: error.message });
    }
}

// Security: Function to check if user is authorized (admin privileges)
function isAuthorizedUser(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    return AUTHORIZED_NUMBERS.some(authNum => cleanNumber.includes(authNum) || authNum.includes(cleanNumber));
}

// Function to check if user is in mailing list
function isInMailingList(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    return WHATSAPP_MAILING_LIST.some(listNum => cleanNumber.includes(listNum) || listNum.includes(cleanNumber));
}

// Enhanced logging
function secureLog(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const sanitizedData = typeof data === 'object' ?
        JSON.stringify(data, null, 2).replace(/("(?:password|token|key|secret|auth|phone)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2') :
        String(data);

    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`,
        Object.keys(data).length > 0 ? sanitizedData : '');
}

// Web-based QR connection route
app.get('/connect', (req, res) => {
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Bot Connection</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #333;
            }
            
            .container {
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                padding: 40px;
                text-align: center;
                max-width: 500px;
                width: 90%;
            }
            
            .header {
                margin-bottom: 30px;
            }
            
            .header h1 {
                color: #667eea;
                margin-bottom: 10px;
                font-size: 28px;
            }
            
            .header p {
                color: #666;
                font-size: 16px;
            }
            
            .status {
                padding: 15px;
                border-radius: 10px;
                margin: 20px 0;
                font-weight: 500;
            }
            
            .connected {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            
            .disconnected {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }
            
            .qr-container {
                background: #f8f9fa;
                border-radius: 15px;
                padding: 20px;
                margin: 20px 0;
            }
            
            .qr-code {
                max-width: 100%;
                height: auto;
                border-radius: 10px;
            }
            
            .instructions {
                background: #e3f2fd;
                border-radius: 10px;
                padding: 20px;
                margin: 20px 0;
                text-align: left;
            }
            
            .instructions h3 {
                color: #1976d2;
                margin-bottom: 15px;
                text-align: center;
            }
            
            .instructions ol {
                margin-left: 20px;
            }
            
            .instructions li {
                margin: 8px 0;
                color: #555;
            }
            
            .reset-section {
                margin-top: 30px;
                padding: 20px;
                background: #fff3cd;
                border-radius: 10px;
                border: 1px solid #ffeaa7;
            }
            
            .reset-form {
                display: flex;
                gap: 10px;
                justify-content: center;
                align-items: center;
                margin-top: 15px;
            }
            
            .reset-input {
                padding: 10px;
                border: 2px solid #ddd;
                border-radius: 8px;
                font-size: 14px;
                width: 150px;
            }
            
            .reset-btn {
                padding: 10px 20px;
                background: #dc3545;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
            }
            
            .reset-btn:hover {
                background: #c82333;
            }
            
            .refresh-btn {
                background: #667eea;
                color: white;
                border: none;
                padding: 12px 25px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 500;
                margin: 10px;
            }
            
            .refresh-btn:hover {
                background: #5a67d8;
            }
            
            .loading {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #667eea;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-right: 10px;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .footer {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #eee;
                color: #666;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🤖 WhatsApp Bot</h1>
                <p>Connect your WhatsApp to start receiving tech news summaries</p>
            </div>
            
            <div id="status-container">
                <!-- Status will be loaded here -->
            </div>
            
            <div id="content-container">
                <!-- QR code or connection info will be loaded here -->
            </div>
            
            <div class="footer">
                <p>🔒 Secure connection by Meet Gandhi's Bot</p>
                <p>Last updated: <span id="last-update">--</span></p>
            </div>
        </div>
        
        <script>
            async function updateStatus() {
                try {
                    const response = await fetch('/connect/status');
                    const data = await response.json();
                    
                    const statusContainer = document.getElementById('status-container');
                    const contentContainer = document.getElementById('content-container');
                    
                    if (data.connected) {
                        statusContainer.innerHTML = \`
                            <div class="status connected">
                                ✅ WhatsApp Connected Successfully!
                            </div>
                        \`;
                        
                        contentContainer.innerHTML = \`
                            <div class="instructions">
                                <h3>🎉 Bot is Ready!</h3>
                                <p style="text-align: center; margin: 15px 0;">
                                    Your WhatsApp bot is connected and running.<br>
                                    Daily summaries will be sent at <strong>\${data.nextSummary || '09:00'}</strong>
                                </p>
                                <p style="text-align: center; margin: 15px 0;">
                                    📱 Mailing list: <strong>\${data.mailingList}</strong> recipients<br>
                                    🔐 Admin users: <strong>\${data.authorizedUsers}</strong>
                                </p>
                            </div>
                            
                            <div class="reset-section">
                                <h4 style="color: #856404; margin-bottom: 10px;">🔄 Reset Connection</h4>
                                <p style="color: #856404; font-size: 14px;">Enter password to disconnect and reconnect:</p>
                                <div class="reset-form">
                                    <input type="password" id="reset-password" class="reset-input" placeholder="Enter password">
                                    <button onclick="resetConnection()" class="reset-btn">Reset</button>
                                </div>
                            </div>
                        \`;
                    } else if (data.qr) {
                        statusContainer.innerHTML = \`
                            <div class="status disconnected">
                                📱 Waiting for WhatsApp Connection...
                            </div>
                        \`;
                        
                        contentContainer.innerHTML = \`
                            <div class="qr-container">
                                <img src="data:image/png;base64,\${data.qr}" class="qr-code" alt="QR Code">
                            </div>
                            
                            <div class="instructions">
                                <h3>📱 How to Connect</h3>
                                <ol>
                                    <li>Open <strong>WhatsApp</strong> on your phone</li>
                                    <li>Go to <strong>Settings</strong> → <strong>Linked Devices</strong></li>
                                    <li>Tap <strong>"Link a Device"</strong></li>
                                    <li>Scan the QR code above</li>
                                    <li>Wait for connection confirmation</li>
                                </ol>
                            </div>
                            
                            <button onclick="updateStatus()" class="refresh-btn">🔄 Refresh</button>
                        \`;
                    } else {
                        statusContainer.innerHTML = \`
                            <div class="status disconnected">
                                🔄 Initializing WhatsApp Connection...
                            </div>
                        \`;
                        
                        contentContainer.innerHTML = \`
                            <div style="padding: 40px;">
                                <div class="loading"></div>
                                <p>Starting WhatsApp client...</p>
                                <button onclick="updateStatus()" class="refresh-btn" style="margin-top: 20px;">🔄 Refresh</button>
                            </div>
                        \`;
                    }
                    
                    document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
                    
                } catch (error) {
                    console.error('Failed to update status:', error);
                    document.getElementById('status-container').innerHTML = \`
                        <div class="status disconnected">
                            ❌ Failed to check connection status
                        </div>
                    \`;
                }
            }
            
            async function resetConnection() {
                const password = document.getElementById('reset-password').value;
                
                if (!password) {
                    alert('Please enter the reset password');
                    return;
                }
                
                try {
                    const response = await fetch('/connect/reset', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ password })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        alert('Connection reset successfully! Reconnecting...');
                        document.getElementById('reset-password').value = '';
                        setTimeout(updateStatus, 2000);
                    } else {
                        alert('Invalid password');
                    }
                } catch (error) {
                    alert('Failed to reset connection');
                }
            }
            
            // Auto-refresh every 5 seconds when not connected
            function startAutoRefresh() {
                setInterval(async () => {
                    const response = await fetch('/connect/status');
                    const data = await response.json();
                    if (!data.connected && data.qr) {
                        updateStatus();
                    }
                }, 5000);
            }
            
            // Initial load
            updateStatus();
            startAutoRefresh();
        </script>
    </body>
    </html>
    `;

    res.send(htmlContent);
});

// QR code status API
app.get('/connect/status', async (req, res) => {
    try {
        if (isConnected) {
            return res.json({
                connected: true,
                nextSummary: process.env.DAILY_SEND_TIME || '09:00',
                mailingList: WHATSAPP_MAILING_LIST.length,
                authorizedUsers: AUTHORIZED_NUMBERS.length
            });
        }

        if (currentQR) {
            try {
                // Generate base64 QR code for web display
                const qrDataUrl = await QRCode.toDataURL(currentQR, { width: 300, margin: 2 });
                const base64Data = qrDataUrl.replace('data:image/png;base64,', '');

                return res.json({
                    connected: false,
                    qr: base64Data
                });
            } catch (qrError) {
                secureLog('error', 'Failed to generate QR code', { error: qrError.message });
                return res.json({
                    connected: false,
                    qr: null,
                    error: 'Failed to generate QR code'
                });
            }
        }

        // No QR available yet
        return res.json({
            connected: false,
            qr: null,
            initializing: true
        });

    } catch (error) {
        secureLog('error', 'Error in connect/status endpoint', { error: error.message });
        return res.status(500).json({
            connected: false,
            qr: null,
            error: 'Internal server error'
        });
    }
});

// Reset connection with password
app.post('/connect/reset', express.json(), async (req, res) => {
    try {
        const { password } = req.body;
        const resetPassword = 'bhul jao';

        if (password !== resetPassword) {
            await sendSecurityAlert('UNAUTHORIZED_RESET_ATTEMPT', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                action: 'Invalid reset password provided'
            });

            secureLog('warn', 'Invalid reset password attempt', {
                ip: req.ip,
                providedPassword: password?.substring(0, 3) + '***'
            });

            return res.status(401).json({ success: false, error: 'Invalid password' });
        }

        secureLog('info', 'Connection reset requested with valid password', { ip: req.ip });

        // Reset connection
        isConnected = false;
        currentQR = null;

        try {
            await client.destroy();
            secureLog('info', 'WhatsApp client destroyed for reset');

            // Reinitialize after a short delay
            setTimeout(() => {
                secureLog('info', 'Reinitializing WhatsApp client after reset');
                client.initialize();
            }, 2000);

            res.json({ success: true, message: 'Connection reset successfully' });

        } catch (error) {
            secureLog('error', 'Error during connection reset', { error: error.message });
            res.status(500).json({ success: false, error: 'Failed to reset connection' });
        }

    } catch (error) {
        secureLog('error', 'Error in reset endpoint', { error: error.message });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// WhatsApp client events with security alerts
client.on('qr', (qr) => {
    currentQR = qr;
    isConnected = false;
    secureLog('info', 'QR code generated for web interface authentication');
    console.log('🔗 Visit http://localhost:' + port + '/connect to scan QR code');
});

client.on('ready', async () => {
    currentQR = null;
    isConnected = true;
    secureLog('info', 'WhatsApp Client authenticated and ready', {
        authorizedUsers: AUTHORIZED_NUMBERS.length,
        mailingList: WHATSAPP_MAILING_LIST.length
    });

    setTimeout(async () => {
        try {
            // Send ready message to admin users only
            for (const authNumber of AUTHORIZED_NUMBERS) {
                const chatId = authNumber + '@c.us';
                await client.sendMessage(chatId,
                    `🤖 *Secure Bot is Ready!* 🚀\n\n` +
                    `👥 *Mailing List:* ${WHATSAPP_MAILING_LIST.length} recipients\n` +
                    `⏰ *Daily Summary:* ${process.env.DAILY_SEND_TIME || '09:00'}\n\n` +
                    `*Commands:*\n` +
                    `• \`!test\` - Manual summary\n` +
                    `• \`!status\` - Bot status\n` +
                    `• \`!list\` - Show mailing list\n\n` +
                    `_Send !test for manual summary_`);
            }
            secureLog('info', 'Ready messages sent to admin users');
        } catch (error) {
            secureLog('error', 'Error sending ready message', { error: error.message });
        }
    }, 15000);
});

client.on('message', async (message) => {
    try {
        if (message.from === 'status@broadcast' || message.from.includes('@g.us')) {
            return;
        }

        const isAuthorized = isAuthorizedUser(message.from);

        if (!isAuthorized) {
            // Send security alert for unauthorized access
            await sendSecurityAlert('UNAUTHORIZED_ACCESS', {
                phoneNumber: message.from,
                action: `Attempted to use command: "${message.body}"`,
                timestamp: new Date().toISOString()
            });

            secureLog('warn', 'Unauthorized access attempt', {
                from: message.from.replace(/\d/g, '*'),
                message: message.body
            });
            return;
        }

        secureLog('info', 'Authorized message received', {
            from: message.from.replace(/\d{4,}/g, '****'),
            command: message.body
        });

        // Handle admin commands
        switch (message.body.toLowerCase()) {
            case '!test':
                secureLog('info', 'Test command detected from authorized user');
                await client.sendMessage(message.from, '🚀 *Generating test summary...*\n_This may take a moment_');
                await sendDailySummary(true, message.from);
                break;

            case '!status':
                const uptime = Math.floor(process.uptime());
                const statusMessage = `📊 *Bot Status*\n\n` +
                    `✅ *Status:* Running\n` +
                    `⏱️ *Uptime:* ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n` +
                    `👥 *Mailing List:* ${WHATSAPP_MAILING_LIST.length} recipients\n` +
                    `🔐 *Admin Users:* ${AUTHORIZED_NUMBERS.length}\n` +
                    `📡 *RSS Feeds:* ${process.env.RSS_FEEDS.split(',').length}\n` +
                    `⏰ *Next Summary:* ${process.env.DAILY_SEND_TIME || '09:00'} daily\n` +
                    `🤖 *AI Provider:* ${process.env.AI_PROVIDER?.toUpperCase() || 'Not configured'}\n\n` +
                    `_🔒 All systems secure_`;
                await client.sendMessage(message.from, statusMessage);
                break;

            case '!list':
                const mailingListMessage = `👥 *WhatsApp Mailing List*\n\n` +
                    `📊 *Total Recipients:* ${WHATSAPP_MAILING_LIST.length}\n\n` +
                    `*Recipients:*\n` +
                    WHATSAPP_MAILING_LIST.map((num, index) =>
                        `${index + 1}. +${num.replace(/(\d{2})\d{6}(\d{4})/, '$1******$2')}`
                    ).join('\n') + '\n\n' +
                    `*Admin Users:*\n` +
                    AUTHORIZED_NUMBERS.map((num, index) =>
                        `${index + 1}. +${num.replace(/(\d{2})\d{6}(\d{4})/, '$1******$2')} 🔐`
                    ).join('\n') + '\n\n' +
                    `_Phone numbers are masked for security_`;
                await client.sendMessage(message.from, mailingListMessage);
                break;

            default:
                if (message.body.startsWith('!')) {
                    await client.sendMessage(message.from,
                        `❓ *Unknown Command*\n\n` +
                        `*Available Commands:*\n` +
                        `• \`!test\` - Manual summary\n` +
                        `• \`!status\` - Bot status\n` +
                        `• \`!list\` - Show mailing list\n\n` +
                        `_Only admins can use commands_`);
                }
                break;
        }

    } catch (error) {
        secureLog('error', 'Error processing message', { error: error.message });
    }
});

// Enhanced error handling with auto-recovery
client.on('disconnected', async (reason) => {
    isConnected = false;
    currentQR = null;
    secureLog('warn', 'WhatsApp client disconnected', { reason });

    // Auto-recovery for certain disconnect reasons
    if (reason === 'LOGOUT' || reason === 'CONFLICT' || reason === 'UNPAIRED') {
        secureLog('info', 'Attempting auto-recovery in 5 seconds...');
        setTimeout(() => {
            try {
                secureLog('info', 'Reinitializing WhatsApp client after disconnect');
                client.initialize();
            } catch (error) {
                secureLog('error', 'Failed to reinitialize client', { error: error.message });
            }
        }, 5000);
    }
});

client.on('auth_failure', (msg) => {
    isConnected = false;
    currentQR = null;
    secureLog('error', 'WhatsApp authentication failed', { message: msg });
});

// Add loading state handler
client.on('loading_screen', (percent, message) => {
    secureLog('info', `WhatsApp loading: ${percent}% - ${message}`);
});

// Add authentication success handler
client.on('authenticated', () => {
    secureLog('info', 'WhatsApp authentication successful');
});

// Add change state handler
client.on('change_state', (state) => {
    secureLog('info', `WhatsApp state changed to: ${state}`);
    if (state === 'CONNECTED') {
        isConnected = true;
        currentQR = null;
    }
});

// Main function to fetch and summarize articles
async function fetchAndSummarizeArticles() {
    const feeds = process.env.RSS_FEEDS.split(',');
    let allArticles = [];

    secureLog('info', 'Starting article fetch process');

    for (const feedUrl of feeds) {
        try {
            const feed = await parser.parseURL(feedUrl.trim());
            secureLog('info', `Fetched articles from feed`, {
                source: feed.title,
                count: feed.items.length
            });

            const latestArticles = feed.items.slice(0, 5);

            for (const item of latestArticles) {
                const articleDate = new Date(item.pubDate);
                const twoDaysAgo = new Date();
                twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

                if (articleDate >= twoDaysAgo) {
                    let content = item.contentSnippet || item.description || '';

                    if (item.link) {
                        try {
                            const fullContent = await fetchArticleContent(item.link);
                            if (fullContent && fullContent.length > content.length) {
                                content = fullContent;
                            }
                        } catch (err) {
                            secureLog('warn', 'Could not fetch full content', {
                                title: item.title.substring(0, 50)
                            });
                        }
                    }

                    allArticles.push({
                        title: item.title,
                        link: item.link,
                        content: content,
                        contentSnippet: item.contentSnippet,
                        description: item.description,
                        source: feed.title,
                        pubDate: articleDate
                    });
                }
            }
        } catch (error) {
            secureLog('error', 'Error fetching feed', {
                feedUrl: feedUrl.substring(0, 50) + '...',
                error: error.message
            });
        }
    }

    const relevantArticles = filterAIAndSoftwareArticles(allArticles);
    relevantArticles.sort((a, b) => b.pubDate - a.pubDate);

    const summaries = [];
    const articlesToSummarize = relevantArticles.slice(0, 10);

    if (articlesToSummarize.length === 0) {
        secureLog('warn', 'No relevant articles found');
        return [];
    }

    for (const article of articlesToSummarize) {
        try {
            secureLog('info', 'Summarizing article', {
                title: article.title.substring(0, 50) + '...'
            });

            let summary = await summarizeWithAI(article.title, article.content);

            summaries.push({
                title: article.title,
                summary: summary,
                link: article.link,
                source: article.source
            });

            await new Promise(resolve => setTimeout(resolve, 1500));

        } catch (error) {
            secureLog('error', 'Error summarizing article', {
                title: article.title.substring(0, 50),
                error: error.message
            });
        }
    }

    return summaries;
}

// Enhanced sendDailySummary with WhatsApp mailing list
async function sendDailySummary(isTest = false, senderChatId = null) {
    try {
        secureLog('info', isTest ? 'Starting test summary' : 'Starting daily summary');

        const summaries = await fetchAndSummarizeArticles();

        if (summaries.length === 0) {
            const noContentMsg = '📭 *No New Articles*\n\nNo relevant AI/Software articles found in recent feeds.';
            if (isTest && senderChatId) {
                await client.sendMessage(senderChatId, noContentMsg);
            }
            secureLog('info', 'No articles to summarize');
            return;
        }

        const today = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        let message = `🤖 *Tech News Summary - ${today}*\n`;
        message += `_AI-powered daily digest from your favorite tech sources, courtesy of Meet Gandhi_\n\n`;

        summaries.forEach((item, index) => {
            message += `*${index + 1}. ${item.title}*\n`;
            message += `📰 _${item.source}_\n`;
            message += `${item.summary}\n`;
            message += `🔗 ${item.link}\n\n`;
        });

        message += `_Powered by ${process.env.AI_PROVIDER.toUpperCase()} AI_`;

        // Determine recipients
        let recipients;
        if (isTest && senderChatId && isAuthorizedUser(senderChatId)) {
            recipients = [senderChatId.replace(/\D/g, '')];
            secureLog('info', 'Sending test summary to requester only');
        } else {
            recipients = WHATSAPP_MAILING_LIST;
            secureLog('info', 'Sending daily summary to mailing list', {
                recipients: recipients.length
            });
        }

        let successCount = 0;
        let failedCount = 0;

        // Send to all recipients with delay to avoid rate limiting
        for (const [index, number] of recipients.entries()) {
            try {
                const chatId = number.includes('@') ? number : number + '@c.us';

                // Add recipient-specific header for non-test messages
                let personalizedMessage = message;
                if (!isTest && recipients.length > 1) {
                    personalizedMessage = `👋 Hi there! Here's your daily tech update:\n\n${message}`;
                }

                await client.sendMessage(chatId, personalizedMessage);
                successCount++;

                secureLog('info', `Summary sent successfully`, {
                    recipient: (index + 1),
                    total: recipients.length,
                    target: number.replace(/\d{4,}/g, '****')
                });

                // Add delay between messages to avoid WhatsApp rate limits
                if (index < recipients.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

            } catch (error) {
                failedCount++;
                secureLog('error', 'Failed to send summary', {
                    target: number.replace(/\d{4,}/g, '****'),
                    error: error.message
                });
            }
        }

        // Send delivery report to admin
        if (!isTest) {
            const reportMessage = `📊 *Delivery Report*\n\n` +
                `✅ *Sent:* ${successCount}/${recipients.length}\n` +
                `❌ *Failed:* ${failedCount}\n` +
                `📄 *Articles:* ${summaries.length}\n` +
                `⏰ *Time:* ${new Date().toLocaleTimeString()}\n\n` +
                `_Daily summary distribution complete_`;

            try {
                await client.sendMessage(ADMIN_NUMBER + '@c.us', reportMessage);
            } catch (error) {
                secureLog('error', 'Failed to send delivery report', { error: error.message });
            }
        }

        // Console fallback if all WhatsApp sends failed
        if (successCount === 0) {
            secureLog('warn', 'No WhatsApp summaries sent - check console fallback');
            console.log('\n' + '='.repeat(80));
            console.log('📰 TECH NEWS SUMMARY (SECURE CONSOLE FALLBACK)');
            console.log('='.repeat(80));
            console.log(message.replace(/\+\d{10,}/g, '[PHONE_REDACTED]'));
            console.log('='.repeat(80) + '\n');
        }

    } catch (error) {
        secureLog('error', 'Error in sendDailySummary', { error: error.message });
    }
}

// Schedule daily summary at 9 AM
const [hour, minute] = (process.env.DAILY_SEND_TIME || '09:00').split(':');
cron.schedule(`${minute} ${hour} * * *`, () => {
    secureLog('info', 'Scheduled daily summary triggered');
    sendDailySummary();
});

// Protected API routes
app.get('/', limiter, (req, res) => {
    res.json({
        status: 'WhatsApp RSS AI Bot is running securely',
        uptime: Math.floor(process.uptime()),
        feeds: process.env.RSS_FEEDS.split(',').length,
        nextSummary: process.env.DAILY_SEND_TIME,
        authorizedUsers: AUTHORIZED_NUMBERS.length,
        mailingList: WHATSAPP_MAILING_LIST.length,
        security: 'enabled',
        distribution: 'WhatsApp only'
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        secure: true,
        whatsappConfigured: true,
        mailingListSize: WHATSAPP_MAILING_LIST.length
    });
});

// Enhanced test endpoint with security logging
app.get('/test', limiter, async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'] || req.query.key;
        const expectedKey = process.env.API_KEY;

        if (expectedKey && apiKey !== expectedKey) {
            await sendSecurityAlert('UNAUTHORIZED_API_ACCESS', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: '/test',
                action: 'Invalid API key provided'
            });

            secureLog('warn', 'Unauthorized API access attempt', {
                ip: req.ip,
                userAgent: req.get('User-Agent')?.substring(0, 50)
            });
            return res.status(401).json({ error: 'Unauthorized' });
        }

        secureLog('info', 'Manual test triggered via secure API', { ip: req.ip });
        await sendDailySummary(true);
        res.json({
            success: true,
            message: 'Test summary sent to WhatsApp mailing list!',
            recipients: WHATSAPP_MAILING_LIST.length
        });
    } catch (error) {
        secureLog('error', 'Error in test endpoint', { error: error.message });
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Apply rate limiting to test routes
app.use('/test', limiter);

// Graceful shutdown
process.on('SIGINT', async () => {
    secureLog('info', 'Shutting down securely...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    secureLog('info', 'Shutting down securely...');
    await client.destroy();
    process.exit(0);
});

// Start server with enhanced error handling
app.listen(port, () => {
    secureLog('info', 'Secure WhatsApp bot started', {
        port,
        authorizedUsers: AUTHORIZED_NUMBERS.length,
        mailingList: WHATSAPP_MAILING_LIST.length
    });
    console.log('🚀 Secure WhatsApp bot with web interface started!');
    console.log('📱 Visit http://localhost:' + port + '/connect to connect WhatsApp');
    console.log('🔗 API available at http://localhost:' + port);
    console.log('🔐 Use password "bhul jao" to reset connection');
    console.log('⚠️  If connection fails, try the reset function on the web interface');

    // Initialize with error handling
    try {
        client.initialize();
    } catch (error) {
        secureLog('error', 'Failed to initialize WhatsApp client', { error: error.message });
        console.log('❌ WhatsApp client failed to start. Try restarting the bot.');
    }
});