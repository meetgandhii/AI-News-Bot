require('dotenv').config();
const { summarizeWithAI } = require('./ai-summarizer');

async function testAI() {
    const testTitle = "OpenAI Announces GPT-5 with Revolutionary Reasoning Capabilities";
    const testContent = "OpenAI today announced GPT-5, its most advanced language model yet, featuring breakthrough reasoning capabilities that allow it to solve complex mathematical problems and write sophisticated code. The model demonstrates significant improvements in logical thinking and can maintain context across much longer conversations. Early tests show GPT-5 can outperform human experts in several specialized domains while maintaining safety guardrails.";

    console.log('🧪 Testing AI Integration');
    console.log('='.repeat(50));
    console.log(`Provider: ${process.env.AI_PROVIDER?.toUpperCase() || 'Not configured'}`);
    console.log(`Test Article: ${testTitle.substring(0, 50)}...`);
    console.log('='.repeat(50));

    try {
        console.log('🔄 Generating summary...');
        const summary = await summarizeWithAI(testTitle, testContent);

        console.log('\n✅ SUCCESS! AI Summary Generated:');
        console.log('-'.repeat(50));
        console.log(summary);
        console.log('-'.repeat(50));
        console.log('\n🎉 Your AI integration is working perfectly!');
        console.log('🚀 Ready to start the bot with: npm start');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Check your API key in .env file');
        console.log('2. Ensure AI_PROVIDER matches your configured service');
        console.log('3. Verify your API key has sufficient credits/quota');
        console.log('4. Check your internet connection');

        // Provide specific guidance based on provider
        const provider = process.env.AI_PROVIDER;
        if (provider === 'gemini') {
            console.log('\n📝 For Gemini:');
            console.log('- Get key from: https://aistudio.google.com');
            console.log('- Ensure GEMINI_API_KEY is set correctly');
        } else if (provider === 'openai') {
            console.log('\n📝 For OpenAI:');
            console.log('- Get key from: https://platform.openai.com');
            console.log('- Ensure OPENAI_API_KEY is set correctly');
            console.log('- Check your account has credits');
        }
    }
}

console.log('🤖 WhatsApp RSS AI Bot - Test Suite');
console.log('Testing AI summarization capabilities...\n');

testAI();