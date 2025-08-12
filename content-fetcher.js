const axios = require('axios');
const cheerio = require('cheerio');

// Keywords to identify AI/Software articles
const AI_SOFTWARE_KEYWORDS = [
    // AI/ML Keywords
    'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
    'transformer', 'llm', 'large language model', 'gpt', 'claude', 'gemini', 'chatgpt',
    'openai', 'anthropic', 'google ai', 'microsoft ai', 'nvidia ai', 'ai model',
    'generative ai', 'computer vision', 'natural language', 'reinforcement learning',
    'diffusion model', 'stable diffusion', 'midjourney', 'dall-e',

    // Software Development Keywords  
    'software', 'programming', 'developer', 'coding', 'framework', 'library',
    'javascript', 'python', 'react', 'node.js', 'typescript', 'api', 'database',
    'cloud computing', 'aws', 'azure', 'google cloud', 'kubernetes', 'docker',
    'microservices', 'devops', 'ci/cd', 'github', 'open source', 'sdk',
    'web development', 'mobile development', 'backend', 'frontend', 'full stack',
    'algorithm', 'data structure', 'software engineering', 'tech stack',
    'version control', 'agile', 'scrum', 'software architecture',

    // Tech Industry Keywords
    'startup', 'funding', 'venture capital', 'ipo', 'acquisition', 'merger',
    'tech company', 'silicon valley', 'unicorn', 'valuation', 'investment',
    'saas', 'platform', 'ecosystem', 'developer tools', 'enterprise software'
];

// Function to check if article is AI/Software related
function isAIOrSoftwareArticle(title, content, description = '') {
    const text = `${title} ${content} ${description}`.toLowerCase();

    // Count keyword matches
    let keywordMatches = 0;
    for (const keyword of AI_SOFTWARE_KEYWORDS) {
        if (text.includes(keyword.toLowerCase())) {
            keywordMatches++;
        }
    }

    // Consider it relevant if it has 2+ keyword matches
    // or if title contains key terms
    const titleLower = title.toLowerCase();
    const hasKeyTitleTerms = [
        'ai', 'artificial intelligence', 'machine learning', 'software', 'developer',
        'programming', 'code', 'app', 'platform', 'tech', 'startup', 'api'
    ].some(term => titleLower.includes(term));

    return keywordMatches >= 2 || hasKeyTitleTerms;
}

async function fetchArticleContent(url) {
    try {
        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive'
            }
        });

        const $ = cheerio.load(response.data);

        // Remove unwanted elements more aggressively
        $('script, style, nav, header, footer, aside, .advertisement, .ad, .sidebar, .related, .comments, .social-share, .newsletter-signup').remove();

        // Enhanced selectors for better content extraction
        let content = '';
        const selectors = [
            // Specific to major tech sites
            '.post-content',           // TechCrunch
            '.article-content',        // General
            '.entry-content',          // WordPress sites
            '.content',               // General
            '.story-body',            // BBC-style
            'article .body',          // Many news sites
            'article p',              // Fallback to article paragraphs
            '.post-body',             // Blog posts
            '.article-body',          // News articles
            'main article',           // Semantic HTML
            'main p',                 // Main content paragraphs
            '.prose',                 // Tailwind prose class
            '.rich-text'              // CMS content
        ];

        for (const selector of selectors) {
            const element = $(selector);
            if (element.length > 0) {
                content = element.text().trim();
                if (content.length > 800) break; // Higher threshold for better content
            }
        }

        // Enhanced fallback: get all paragraphs and filter
        if (content.length < 300) {
            const paragraphs = $('p').map((i, el) => $(el).text().trim()).get();
            content = paragraphs
                .filter(p => p.length > 50) // Filter out short paragraphs
                .join(' ');
        }

        // Clean up the content more thoroughly
        content = content
            .replace(/\s+/g, ' ')           // Multiple spaces to single
            .replace(/\n+/g, ' ')           // Newlines to spaces
            .replace(/\t+/g, ' ')           // Tabs to spaces
            .replace(/[^\w\s.,!?;:()\-]/g, '') // Remove special chars except common punctuation
            .trim();

        // Return longer content for better AI analysis
        return content.substring(0, 4000);

    } catch (error) {
        console.error(`Error fetching content from ${url}:`, error.message);
        return null;
    }
}

// Enhanced function to filter articles by relevance
function filterAIAndSoftwareArticles(articles) {
    return articles.filter(article => {
        const isRelevant = isAIOrSoftwareArticle(
            article.title,
            article.content || article.contentSnippet || article.description || '',
            article.description || ''
        );

        if (isRelevant) {
            console.log(`✅ Relevant: ${article.title.substring(0, 60)}...`);
        } else {
            console.log(`❌ Filtered out: ${article.title.substring(0, 60)}...`);
        }

        return isRelevant;
    });
}

module.exports = {
    fetchArticleContent,
    filterAIAndSoftwareArticles,
    isAIOrSoftwareArticle
};