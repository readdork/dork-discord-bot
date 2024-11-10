import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior, VoiceConnectionStatus } from '@discordjs/voice';
import OpenAI from 'openai';
import play from 'play-dl';

const VOICE_CHANNEL_ID = ''; // Add your voice channel ID here

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Set up audio player
const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Play
    }
});

// Keep track of the current connection
let connection = null;

// Barry's personality prompt
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

// Function to start streaming
async function startStreaming(voiceChannel) {
    try {
        // Connect to the voice channel
        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        // Handle connection state changes
        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('Voice connection ready!');
            playStream();
        });

        connection.on('error', error => {
            console.error('Voice connection error:', error);
            reconnect(voiceChannel);
        });

        // Subscribe the player to the connection
        connection.subscribe(player);

    } catch (error) {
        console.error('Error starting stream:', error);
        setTimeout(() => startStreaming(voiceChannel), 5000);
    }
}

// Function to play the stream
async function playStream() {
    try {
        const stream = await play.stream(process.env.RADIO_URL);
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type
        });
        player.play(resource);
    } catch (error) {
        console.error('Error playing stream:', error);
        setTimeout(playStream, 5000);
    }
}

// Function to handle reconnection
function reconnect(voiceChannel) {
    console.log('Attempting to reconnect...');
    if (connection) {
        connection.destroy();
    }
    setTimeout(() => startStreaming(voiceChannel), 5000);
}

// Handle player errors
player.on('error', error => {
    console.error('Player error:', error);
    playStream();
});

// Bot ready event
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ 
            name: "DORK+",
            type: ActivityType.Watching
        }],
        status: 'online'
    });

    // Connect to voice channel and start streaming
    try {
        const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
        if (channel) {
            await startStreaming(channel);
            console.log('Started radio stream');
        }
    } catch (error) {
        console.error('Error connecting to voice channel:', error);
    }
});

// Message handling
client.on('messageCreate', async message => {
    try {
        // Handle radio commands
        if (message.content.startsWith('!radio')) {
            const command = message.content.split(' ')[1];
            
            switch (command) {
                case 'restart':
                    if (message.member.permissions.has('MANAGE_CHANNELS')) {
                        const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
                        if (channel) {
                            await startStreaming(channel);
                            message.reply('Restarting radio stream...');
                        }
                    }
                    break;
                
                case 'status':
                    const status = connection?.state?.status || 'Not connected';
                    message.reply(`Radio status: ${status}`);
                    break;
            }
            return;
        }

        // Ignore messages from bots
        if (message.author.bot) return;

        // Only respond when mentioned
        if (!message.mentions.has(client.user)) return;

        console.log('Message received:', message.content);

        // Show typing indicator
        await message.channel.sendTyping();

        // Remove the bot mention from the message
        const messageContent = message.content.replace(/<@!?\d+>/g, '').trim();

        // Get AI response
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { "role": "system", "content": BARRY_PROMPT },
                { "role": "user", "content": messageContent }
            ],
            max_tokens: 1000,
            temperature: 0.8
        });

        // Send response
        await message.reply(completion.choices[0].message.content);

    } catch (error) {
        console.error('Error:', error);
        await message.reply("*Spills coffee on keyboard* ...Sorry, bit of an intern moment there. Mind trying again?");
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

// Login
client.login(process.env.DISCORD_TOKEN);
