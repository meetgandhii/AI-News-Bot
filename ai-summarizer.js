const axios = require('axios');

// Universal AI summarizer - supports multiple providers
async function summarizeWithAI(title, content) {
    const provider = process.env.AI_PROVIDER || 'openai';

    switch (provider) {
        case 'openai':
            return await summarizeWithOpenAI(title, content);
        case 'gemini':
            return await summarizeWithGemini(title, content);
        case 'groq':
            return await summarizeWithGroq(title, content);
        case 'claude':
            return await summarizeWithClaude(title, content);
        case 'perplexity':
            return await summarizeWithPerplexity(title, content);
        default:
            throw new Error(`Unsupported AI provider: ${provider}`);
    }
}

// Enhanced prompt for all providers - focused on tech professionals
const getTechPrompt = (title, content) => `
You are a tech industry analyst providing insights to experienced software engineers, CTOs, and tech professionals. 

Analyze this article with a focus on:
- Technical architecture, implementation details, and engineering decisions
- Market positioning, competitive landscape, and business implications
- Performance metrics, scalability considerations, or benchmarks when mentioned
- Key technologies, frameworks, protocols, or methodologies involved
- Potential disruptions to existing tech stacks or industry dynamics
- Technical challenges or breakthroughs that aren't obvious from the headline

Title: ${title}

Content: ${content}

Provide a 2-3 sentence technical summary that gives insights beyond what's obvious from just reading the headline. Focus on the "why" and "how" that matters to tech professionals.`;

// OpenAI GPT integration
async function summarizeWithOpenAI(title, content) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are a technical analyst writing for experienced tech professionals. Focus on technical depth, market implications, and insights that go beyond surface-level reporting.'
                },
                {
                    role: 'user',
                    content: getTechPrompt(title, content.substring(0, 3000))
                }
            ],
            max_tokens: 180,
            temperature: 0.2
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('OpenAI API error:', error.response?.data || error.message);
        throw new Error('Failed to summarize with OpenAI');
    }
}

// Google Gemini integration
async function summarizeWithGemini(title, content) {
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{
                    parts: [{
                        text: `You are a senior tech analyst writing for CTOs and engineering leaders. Provide technical insights that experienced developers would find valuable.

${getTechPrompt(title, content.substring(0, 3000))}`
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: 180,
                    temperature: 0.2
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
        console.error('Gemini API error:', error.response?.data || error.message);
        throw new Error('Failed to summarize with Gemini');
    }
}

// Groq integration (Llama models)
async function summarizeWithGroq(title, content) {
    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.1-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: 'You are a tech industry expert analyzing news for software engineers and tech leaders. Focus on technical implementation details, architectural decisions, and market impact that professionals need to know.'
                },
                {
                    role: 'user',
                    content: getTechPrompt(title, content.substring(0, 3000))
                }
            ],
            max_tokens: 180,
            temperature: 0.2
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Groq API error:', error.response?.data || error.message);
        throw new Error('Failed to summarize with Groq');
    }
}

// Claude API integration
async function summarizeWithClaude(title, content) {
    try {
        const response = await axios.post('https://api.anthropic.com/v1/messages', {
            model: 'claude-3-sonnet-20240229',
            max_tokens: 200,
            messages: [{
                role: 'user',
                content: `You are a technical analyst providing insights to senior engineers and tech executives. Focus on architectural decisions, technical depth, and market implications.

${getTechPrompt(title, content.substring(0, 4000))}`
            }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            }
        });

        return response.data.content[0].text.trim();
    } catch (error) {
        console.error('Claude API error:', error.response?.data || error.message);
        throw new Error('Failed to summarize with Claude');
    }
}

// Perplexity API integration - Enhanced for tech professionals
async function summarizeWithPerplexity(title, content) {
    try {
        const response = await axios.post('https://api.perplexity.ai/chat/completions', {
            model: 'llama-3-sonar-small-32k-online',
            messages: [
                {
                    role: 'system',
                    content: `You are a tech industry analyst providing insights to experienced tech professionals and engineers. Your summaries should:
                    - Focus on technical details, architectural decisions, and implementation specifics
                    - Highlight market implications, competitive positioning, and business impact
                    - Include performance metrics, scalability considerations, or technical benchmarks when available
                    - Mention key technologies, frameworks, or methodologies involved
                    - Note potential disruptions to existing tech stacks or market dynamics
                    - Provide context that goes beyond just restating the headline
                    Keep summaries to 2-3 sentences but make them information-dense and valuable for someone who already understands the tech landscape.`
                },
                {
                    role: 'user',
                    content: `Analyze this tech article for a technical audience. Focus on the underlying technology, market implications, and technical details that aren't obvious from just the headline:

Title: ${title}

Content: ${content.substring(0, 2000)}

Provide a technical summary that includes:
1. Key technical details or architectural decisions
2. Market/competitive implications  
3. Why this matters beyond the obvious headline`
                }
            ],
            max_tokens: 200,
            temperature: 0.2
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Perplexity API error:', error.response?.data || error.message);
        throw new Error('Failed to summarize with Perplexity');
    }
}

module.exports = { summarizeWithAI };