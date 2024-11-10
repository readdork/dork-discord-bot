import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    NoSubscriberBehavior, 
    VoiceConnectionStatus,
    StreamType
} from '@discordjs/voice';
import miniget from 'miniget';
import OpenAI from 'openai';

const VOICE_CHANNEL_ID = '1305261184970395709';
const RADIO_URL = 'https://s2.radio.co/s3e57f0675/listen';

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

const RADIO_CO_STATION_ID = 's3e57f0675'; // Your station ID from the stream URL
let currentTrack = '';
let trackCheckInterval = null;

async function updateNowPlaying() {
    try {
        const response = await fetch(`https://public.radio.co/stations/${RADIO_CO_STATION_ID}/status`);
        const data = await response.json();
        
        if (data.current_track && data.current_track.title) {
            const newTrack = data.current_track.title;
            if (newTrack !== currentTrack) {
                currentTrack = newTrack;
                console.log('Now playing:', currentTrack);
                
                // Get the voice channel and update its name
                const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
                if (channel) {
                    try {
                        await channel.setName(`🎵 ${currentTrack.substring(0, 90)}`);
                    } catch (error) {
                        if (error.code === 50035) {
                            console.log('Rate limited on channel update, waiting...');
                        } else {
                            console.error('Error updating channel name:', error);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error fetching now playing:', error);
    }
}

let connection = null;
let isRestarting = false;
let streamTimeout = null;

async function startStreaming(voiceChannel) {
    if (isRestarting) {
        console.log('Already restarting, skipping...');
        return;
    }

    try {
        isRestarting = true;
        console.log('Starting stream connection...');
        
        if (streamTimeout) {
            clearTimeout(streamTimeout);
            streamTimeout = null;
        }

        if (connection) {
            connection.destroy();
        }

        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false
        });

        const stream = miniget(RADIO_URL, {
            maxRetries: 10,
            maxReconnects: 10,
            backoff: { inc: 500, max: 10000 }
        });

        const resource = createAudioResource(stream, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true,
        });

        resource.volume?.setVolume(1);

        connection.subscribe(player);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        player.play(resource);
        console.log('Stream started successfully');

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            console.log('Connection disconnected');
            if (!isRestarting) {
                streamTimeout = setTimeout(() => {
                    isRestarting = false;
                    startStreaming(voiceChannel);
                }, 5000);
            }
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('Connection ready');
        });

        stream.on('error', (error) => {
            console.error('Stream error:', error);
            if (!isRestarting) {
                streamTimeout = setTimeout(() => {
                    isRestarting = false;
                    startStreaming(voiceChannel);
                }, 5000);
            }
        });

    } catch (error) {
        console.error('Error in startStreaming:', error);
        if (!isRestarting) {
            streamTimeout = setTimeout(() => {
                isRestarting = false;
                startStreaming(voiceChannel);
            }, 5000);
        }
    } finally {
        isRestarting = false;
    }

    if (!trackCheckInterval) {
        updateNowPlaying();
        trackCheckInterval = setInterval(updateNowPlaying, 5000);
    }
}

// Player event handling
player.on('stateChange', (oldState, newState) => {
    console.log(`Player state changed from ${oldState.status} to ${newState.status}`);
    
    if (newState.status === 'idle' && !isRestarting) {
        console.log('Player went idle, waiting before restart...');
        const channel = client.channels.cache.get(VOICE_CHANNEL_ID);
        if (channel) {
            streamTimeout = setTimeout(() => {
                console.log('Attempting stream restart after idle...');
                startStreaming(channel);
            }, 5000);
        }
    }
});

player.on('error', error => {
    console.error('Player error:', error);
    if (!isRestarting) {
        const channel = client.channels.cache.get(VOICE_CHANNEL_ID);
        if (channel) {
            streamTimeout = setTimeout(() => {
                startStreaming(channel);
            }, 5000);
        }
    }
});

function stopTrackChecking() {
    if (trackCheckInterval) {
        clearInterval(trackCheckInterval);
        trackCheckInterval = null;
    }
}

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

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ 
            name: "DORK+",
            type: ActivityType.Watching
        }],
        status: 'online'
    });

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
                    const playerStatus = player.state.status;
                    message.reply(`Radio status: Connection=${status}, Player=${playerStatus}`);
                    break;

                case 'debug':
                    if (message.member.permissions.has('MANAGE_CHANNELS')) {
                        const playerState = player.state.status;
                        const connectionState = connection?.state?.status;
                        message.reply(`Debug Info:\nPlayer State: ${playerState}\nConnection State: ${connectionState}\nChannel ID: ${VOICE_CHANNEL_ID}\nRestart Flag: ${isRestarting}`);
                    }
                    break;

                case 'track':
                    message.reply(`Currently playing: ${currentTrack || 'Unknown'}`);
                    break;

                case 'refresh':
                    if (message.member.permissions.has('MANAGE_CHANNELS')) {
                        await updateNowPlaying();
                        message.reply('Refreshed track information.');
                    }
                    break;

                case 'fix':
                    if (message.member.permissions.has('MANAGE_CHANNELS')) {
                        isRestarting = false;
                        if (streamTimeout) {
                            clearTimeout(streamTimeout);
                            streamTimeout = null;
                        }
                        const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
                        if (channel) {
                            await startStreaming(channel);
                            message.reply('Fixing stream...');
                        }
                    }
                    break;

                default:
                    message.reply('Available commands: status, restart (admin only), debug (admin only), fix (admin only)');
                    break;
            }
            return;
        }

        if (message.author.bot) return;
        if (!message.mentions.has(client.user)) return;

        console.log('Message received:', message.content);

        await message.channel.sendTyping();
        const messageContent = message.content.replace(/<@!?\d+>/g, '').trim();

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { "role": "system", "content": BARRY_PROMPT },
                { "role": "user", "content": messageContent }
            ],
            max_tokens: 1000,
            temperature: 0.8
        });

        if (completion.choices && completion.choices[0]) {
            await message.reply(completion.choices[0].message.content);
        } else {
            console.log('No choices returned from OpenAI');
            await message.reply("Couldn't get a response, try again in a bit!");
        }

    } catch (error) {
        console.error('Error:', error);
        await message.reply("*Spills coffee on keyboard* ...Sorry, bit of an intern moment there. Mind trying again?");
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

player.on('error', error => {
    console.error('Player error:', error);
    stopTrackChecking();
    if (!isRestarting) {
        const channel = client.channels.cache.get(VOICE_CHANNEL_ID);
        if (channel) {
            streamTimeout = setTimeout(() => {
                startStreaming(channel);
            }, 5000);
        }
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
