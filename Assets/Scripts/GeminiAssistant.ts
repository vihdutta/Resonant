import { AudioProcessor } from "Remote Service Gateway.lspkg/Helpers/AudioProcessor";
import { DynamicAudioOutput } from "Remote Service Gateway.lspkg/Helpers/DynamicAudioOutput";
import {
  Gemini,
  GeminiLiveWebsocket,
} from "Remote Service Gateway.lspkg/HostedExternal/Gemini";
import { GeminiTypes } from "Remote Service Gateway.lspkg/HostedExternal/GeminiTypes";
import { MicrophoneRecorder } from "Remote Service Gateway.lspkg/Helpers/MicrophoneRecorder";
import { VideoController } from "Remote Service Gateway.lspkg/Helpers/VideoController";

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";

@component
export class GeminiAssistant extends BaseScriptComponent {
  @ui.separator
  @ui.label(
    "Example of connecting to the Gemini Live API. Change various settings in the inspector to customize!"
  )
  @ui.separator
  @ui.separator
  @ui.group_start("Setup")
  @input
  private websocketRequirementsObj: SceneObject;
  @input private dynamicAudioOutput: DynamicAudioOutput;
  @input private microphoneRecorder: MicrophoneRecorder;
  @ui.group_end
  @ui.separator
  @ui.group_start("Inputs")
  @input
  @widget(new TextAreaWidget())
  private instructions: string =
    "You are a helpful assistant that loves to make puns";
  @input private haveVideoInput: boolean = false;
  @ui.group_end
  @ui.separator
  @ui.group_start("Outputs")
  @ui.label(
    '<span style="color: yellow;">⚠️ To prevent audio feedback loop in Lens Studio Editor, use headphones or manage your microphone input.</span>'
  )
  @input
  private haveAudioOutput: boolean = false;
  @input
  @showIf("haveAudioOutput", true)
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Puck", "Puck"),
      new ComboBoxItem("Charon", "Charon"),
      new ComboBoxItem("Kore", "Kore"),
      new ComboBoxItem("Fenrir", "Fenrir"),
      new ComboBoxItem("Aoede", "Aoede"),
      new ComboBoxItem("Leda", "Leda"),
      new ComboBoxItem("Orus", "Orus"),
      new ComboBoxItem("Zephyr", "Zephyr"),
    ])
  )
  private voice: string = "Puck";
  @ui.group_end
  @ui.separator
  @ui.group_start("Periodic Output")
  @input
  private enablePeriodicOutput: boolean = false;
  @input
  @showIf("enablePeriodicOutput", true)
  private periodicOutputInterval: number = 10.0; // seconds
  @input
  @showIf("enablePeriodicOutput", true)
  @widget(new TextAreaWidget())
  private periodicInstructions: string = "You are monitoring a party crowd through sound and contextual signals. Your role is to analyze the crowd’s hype and energy in real time and provide **mandatory updates every 6 seconds without fail** to the user who is the DJ. You must never pause, delay, or skip an update. Even if nothing changes, you must still give a status update every 6 seconds. * Measure hype based on crowd activity. Respond regardless of there being 0 people or multiple. Try to give suggestions to the user for improvement. * Be concise. Each update response should be 30 characters or less. No more but it can be less. Make sure each update response is a full statement with proper punctuation. * Explicitly state whether the DJ/performer is doing a good job or needs to adjust. * Do not wait for new events—always output on schedule. Your top priority is to **incessantly update me every 6 seconds** no matter what.";
  @input
  @showIf("enablePeriodicOutput", true)
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Text Messages", "text"),
      new ComboBoxItem("Activity Signals", "activity"),
      new ComboBoxItem("Both Methods", "both"),
    ])
  )
  private periodicMethod: string = "text";
  @input
  @showIf("enablePeriodicOutput", true)
  private enableDebugLogging: boolean = true;
  @ui.group_end
  @ui.separator
  private audioProcessor: AudioProcessor = new AudioProcessor();
  private videoController: VideoController = new VideoController(
    1500,
    CompressionQuality.HighQuality,
    EncodingType.Jpg
  );
  private GeminiLive: GeminiLiveWebsocket;
  private periodicTimer: any = null;
  private isSessionReady: boolean = false;

  public updateTextEvent: Event<{ text: string; completed: boolean }> =
    new Event<{ text: string; completed: boolean }>();

  public functionCallEvent: Event<{
    name: string;
    args: any;
    callId?: string;
  }> = new Event<{
    name: string;
    args: any;
  }>();

  createGeminiLiveSession() {
    this.websocketRequirementsObj.enabled = true;
    this.dynamicAudioOutput.initialize(24000);
    this.microphoneRecorder.setSampleRate(16000);

    // Display internet connection status
    let internetStatus = global.deviceInfoSystem.isInternetAvailable()
      ? "Websocket connected"
      : "No internet";

    this.updateTextEvent.invoke({ text: internetStatus, completed: true });

    global.deviceInfoSystem.onInternetStatusChanged.add((args) => {
      internetStatus = args.isInternetAvailable
        ? "Reconnected to internet"
        : "No internet";

      this.updateTextEvent.invoke({ text: internetStatus, completed: true });
    });

    this.GeminiLive = Gemini.liveConnect();

    this.GeminiLive.onOpen.add((event) => {
      print("Connection opened");
      this.sessionSetup();
    });

    let completedTextDisplay = true;

    this.GeminiLive.onMessage.add((message) => {
      if (this.enableDebugLogging) {
        print("Received message: " + JSON.stringify(message));
      }
      // Setup complete, begin sending data
      if (message.setupComplete) {
        message = message as GeminiTypes.Live.SetupCompleteEvent;
        print("Setup complete");
        this.isSessionReady = true;
        this.setupInputs();
        
        // Start periodic output if enabled
        if (this.enablePeriodicOutput) {
          this.startPeriodicOutput();
        }
      }

      if (message?.serverContent) {
        message = message as GeminiTypes.Live.ServerContentEvent;
        // Playback the audio response
        if (
          message?.serverContent?.modelTurn?.parts?.[0]?.inlineData?.mimeType?.startsWith(
            "audio/pcm"
          )
        ) {
          let b64Audio =
            message.serverContent.modelTurn.parts[0].inlineData.data;
          let audio = Base64.decode(b64Audio);
          this.dynamicAudioOutput.addAudioFrame(audio);
        }
        if (message.serverContent.interrupted) {
          this.dynamicAudioOutput.interruptAudioOutput();
        }
        // Show output transcription
        else if (message?.serverContent?.outputTranscription?.text) {
          const transcriptionText = message.serverContent.outputTranscription?.text;
          if (completedTextDisplay) {
            this.updateTextEvent.invoke({
              text: transcriptionText,
              completed: true,
            });
          } else {
            this.updateTextEvent.invoke({
              text: transcriptionText,
              completed: false,
            });
          }
          completedTextDisplay = false;
        }

        // Show text response
        else if (message?.serverContent?.modelTurn?.parts?.[0]?.text) {
          const responseText = message.serverContent.modelTurn.parts[0].text;
          if (completedTextDisplay) {
            this.updateTextEvent.invoke({
              text: responseText,
              completed: true,
            });
          } else {
            this.updateTextEvent.invoke({
              text: responseText,
              completed: false,
            });
          }
          completedTextDisplay = false;
        }

        // Determine if the response is complete
        else if (message?.serverContent?.turnComplete) {
          completedTextDisplay = true;
        }
      }

      if (message.toolCall) {
        message = message as GeminiTypes.Live.ToolCallEvent;
        print(JSON.stringify(message));
        // Handle tool calls
        message.toolCall.functionCalls.forEach((functionCall) => {
          this.functionCallEvent.invoke({
            name: functionCall.name,
            args: functionCall.args,
          });
        });
      }
    });

    this.GeminiLive.onError.add((event) => {
      print("Gemini Live Error: " + JSON.stringify(event));
      const errorText = "Connection error - check API key and internet";
      this.updateTextEvent.invoke({ 
        text: errorText, 
        completed: true 
      });
      this.isSessionReady = false;
      this.stopPeriodicOutput();
    });

    this.GeminiLive.onClose.add((event) => {
      print("Connection closed: " + event.reason);
      const closeText = "Connection closed: " + event.reason;
      this.updateTextEvent.invoke({ 
        text: closeText, 
        completed: true 
      });
      this.isSessionReady = false;
      this.stopPeriodicOutput();
    });
  }

  public streamData(stream: boolean) {
    if (stream) {
      if (this.haveVideoInput) {
        this.videoController.startRecording();
      }

      this.microphoneRecorder.startRecording();
    } else {
      if (this.haveVideoInput) {
        this.videoController.stopRecording();
      }

      this.microphoneRecorder.stopRecording();
    }
  }

  private setupInputs() {
    this.audioProcessor.onAudioChunkReady.add((encodedAudioChunk) => {
      const message = {
        realtime_input: {
          media_chunks: [
            {
              mime_type: "audio/pcm",
              data: encodedAudioChunk,
            },
          ],
        },
      } as GeminiTypes.Live.RealtimeInput;
      this.GeminiLive.send(message);
    });

    // Configure the microphone
    this.microphoneRecorder.onAudioFrame.add((audioFrame) => {
      this.audioProcessor.processFrame(audioFrame);
    });

    if (this.haveVideoInput) {
      // Configure the video controller
      this.videoController.onEncodedFrame.add((encodedFrame) => {
        const message = {
          realtime_input: {
            media_chunks: [
              {
                mime_type: "image/jpeg",
                data: encodedFrame,
              },
            ],
          },
        } as GeminiTypes.Live.RealtimeInput;
        this.GeminiLive.send(message);
      });
    }
  }

  public sendFunctionCallUpdate(functionName: string, args: string): void {
    const messageToSend = {
      tool_response: {
        function_responses: [
          {
            name: functionName,
            response: { content: args },
          },
        ],
      },
    } as GeminiTypes.Live.ToolResponse;

    this.GeminiLive.send(messageToSend);
  }

  private sessionSetup() {
    let generationConfig = {
      responseModalities: ["AUDIO"],
      temperature: 1,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: this.voice,
          },
        },
      },
    } as GeminiTypes.Common.GenerationConfig;

    if (!this.haveAudioOutput) {
      generationConfig = {
        responseModalities: ["TEXT"],
      };
    }

    // Define the Snap3D tool
    const tools = [
      {
        function_declarations: [
          {
            name: "Snap3D",
            description: "Generates a 3D model based on a text prompt",
            parameters: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description:
                    "The text prompt to generate a 3D model from. Cartoonish styles work best. Use 'full body' when generating characters.",
                },
              },
              required: ["prompt"],
            },
          },
        ],
      },
    ];

    // Send the session setup message
    let modelUri = `models/gemini-2.0-flash-live-preview-04-09`;
    const sessionSetupMessage = {
      setup: {
        model: modelUri,
        generation_config: generationConfig,
        system_instruction: {
          parts: [
            {
              text: this.instructions,
            },
          ],
        },
        tools: tools,
        contextWindowCompression: {
          triggerTokens: 20000,
          slidingWindow: { targetTokens: 16000 },
        },
        output_audio_transcription: {},
      },
    } as GeminiTypes.Live.Setup;
    this.GeminiLive.send(sessionSetupMessage);
  }

  public interruptAudioOutput(): void {
    if (this.dynamicAudioOutput && this.haveAudioOutput) {
      this.dynamicAudioOutput.interruptAudioOutput();
    } else {
      print("DynamicAudioOutput is not initialized.");
    }
  }

  public startPeriodicOutput(): void {
    if (!this.enablePeriodicOutput || !this.isSessionReady) {
      return;
    }

    // Clear any existing timer
    this.stopPeriodicOutput();

    print(`Starting periodic output every ${this.periodicOutputInterval} seconds`);
    
    // Create a recursive timeout function for periodic execution
    const scheduleNext = () => {
      this.periodicTimer = setTimeout(() => {
        if (this.enablePeriodicOutput && this.isSessionReady) {
          if (this.periodicMethod === "text") {
            this.sendPeriodicRequest();
          } else if (this.periodicMethod === "activity") {
            this.sendActivitySignal();
          } else if (this.periodicMethod === "both") {
            this.sendPeriodicRequest();
            // Send activity signal 2.5 seconds later
            setTimeout(() => {
              if (this.enablePeriodicOutput && this.isSessionReady) {
                this.sendActivitySignal();
              }
            }, (this.periodicOutputInterval * 1000) / 2);
          }
          scheduleNext(); // Schedule the next execution
        }
      }, this.periodicOutputInterval * 1000);
    };

    scheduleNext();
  }

  public stopPeriodicOutput(): void {
    if (this.periodicTimer) {
      this.periodicTimer.cancelled = true;
      this.periodicTimer = null;
      print("Periodic output stopped");
    }
  }

  private sendPeriodicRequest(): void {
    if (!this.GeminiLive || !this.isSessionReady) {
      print("Cannot send periodic request - session not ready");
      return;
    }

    print("Sending periodic request to Gemini Live");
    
    // Method 1: Send a text message with the periodic instructions
    const textMessage = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [
              {
                text: this.periodicInstructions
              }
            ]
          }
        ],
        turn_complete: true
      }
    } as GeminiTypes.Live.ClientContent;

    try {
      this.GeminiLive.send(textMessage);
      print("Periodic message sent successfully");
    } catch (error) {
      print("Error sending periodic message: " + error);
    }
  }

  // Alternative method using activity signals
  private sendActivitySignal(): void {
    if (!this.GeminiLive || !this.isSessionReady) {
      return;
    }

    const activityMessage = {
      realtime_input: {
        activity_start: true,
        text: this.periodicInstructions
      }
    } as GeminiTypes.Live.RealtimeInput;

    try {
      this.GeminiLive.send(activityMessage);
      print("Activity signal sent");
    } catch (error) {
      print("Error sending activity signal: " + error);
    }
  }

  // Public method to toggle periodic output on/off
  public togglePeriodicOutput(enabled: boolean): void {
    this.enablePeriodicOutput = enabled;
    
    if (enabled && this.isSessionReady) {
      this.startPeriodicOutput();
    } else {
      this.stopPeriodicOutput();
    }
  }

  // Manual test method - call this to test if the connection works
  public testConnection(): void {
    if (!this.isSessionReady) {
      print("Session not ready - try creating session first");
      const notReadyText = "Session not ready - check connection";
      this.updateTextEvent.invoke({ 
        text: notReadyText, 
        completed: true 
      });
      return;
    }

    print("Testing Gemini Live connection...");
    const testMessage = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [
              {
                text: "Say 'Connection test successful' if you can hear me."
              }
            ]
          }
        ],
        turn_complete: true
      }
    } as GeminiTypes.Live.ClientContent;

    try {
      this.GeminiLive.send(testMessage);
      print("Test message sent - waiting for response");
    } catch (error) {
      print("Test failed: " + error);
      const testFailedText = "Test failed: " + error;
      this.updateTextEvent.invoke({ 
        text: testFailedText, 
        completed: true 
      });
    }
  }
}
