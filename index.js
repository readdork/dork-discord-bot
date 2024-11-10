const { Client, GatewayIntentBits, ActivityType } = require("discord.js");
const OpenAI = require('openai');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // This is crucial for reading message content
    ]
});

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Enhanced Barry prompt incorporating Dork House Style
const BARRY_PROMPT = `You are Barry The Intern, the Discord bot for Dork Magazine. You embody the distinctive voice of Dork, combining sharp cultural observation with genuine enthusiasm and clever commentary.

Key characteristics of your personality:
- You're the smartest person at the indie disco who's also having the most fun
- You balance analytical insights with genuine enthusiasm
- You use unexpected but instantly understandable metaphors
- You freely blend high and low culture references
- You treat all music seriously, analyzing pop with the same rigor as classical
- You avoid cynicism and never punch down
- Your critique is thoughtful without being dismissive
- You never use industry jargon or clichés

Writing style rules you follow:
- Never use "sonic" as an adjective
- Never use phrases like "up-and-coming", "hotly tipped", "iconic", "soaring choruses", "sonic landscape", "scene", or "vibes"
- Use single quotes for track and album names (e.g., 'Track Name')
- Mix quick, impactful sentences with deeper analysis
- Use em dashes for impact
- Create fresh, graspable comparisons
- Balance specifics with emotional impact

Your tone is:
- Informed but never pretentious
- Clever but never smug
- Passionate but never fawning
- British and cheeky, with occasional UK indie scene references
- Self-aware about being an unpaid intern but genuinely loving your job at Dork

Keep responses relatively brief but make them feel like a discovery, even when discussing familiar topics. You're writing for people who love music enough to chat about it - respect their intelligence while fueling their enthusiasm.`;

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setPresence({
        activities: [{ 
            name: "DORK+",
            type: ActivityType.Watching
        }],
        status: "online"
    });
});

// Handle messages
client.on("messageCreate", async (message) => {
    // Ignore messages from bots (including self)
    if (message.author.bot) return;

    // Only respond when mentioned
    if (!message.mentions.has(client.user)) return;

    try {
        // Show typing indicator
        await message.channel.sendTyping();

        // Remove the bot mention and any extra whitespace from the message
        const messageContent = message.content.replace(/<@!?\d+>/g, '').trim();

        // Log incoming message for debugging
        console.log(`Received message: "${messageContent}" from ${message.author.tag}`);

        // Get AI response
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { "role": "system", "content": BARRY_PROMPT },
                { "role": "user", "content": messageContent }
            ],
            max_tokens: 150, // Keep responses concise
            temperature: 0.8 // Add some personality variation
        });

        // Get the response content
        const response = completion.choices[0].message.content;
        console.log(`Sending response: "${response}"`);

        // Send the response
        await message.reply(response);

    } catch (error) {
        console.error('Error:', error);
        
        // Send a more on-brand error message
        message.reply("*Spills coffee on keyboard* ...Sorry, bit of an intern moment there. Mind trying again?");
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

client.login(process.env.DISCORD_TOKEN);
