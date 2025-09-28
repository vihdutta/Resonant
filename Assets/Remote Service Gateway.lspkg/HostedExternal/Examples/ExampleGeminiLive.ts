import { AudioProcessor } from "../../Helpers/AudioProcessor";
import { DynamicAudioOutput } from "../../Helpers/DynamicAudioOutput";
import { Gemini } from "../Gemini";
import { GeminiTypes } from "../GeminiTypes";
import { MicrophoneRecorder } from "../../Helpers/MicrophoneRecorder";
import { VideoController } from "../../Helpers/VideoController";

@component
export class ExampleGeminiLive extends BaseScriptComponent {
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
  @input private textDisplay: Text;
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

  private audioProcessor: AudioProcessor = new AudioProcessor();
  private videoController: VideoController = new VideoController();
  @ui.group_end
  @ui.separator
  onAwake() {
    this.websocketRequirementsObj.enabled = true;
    this.createEvent("OnStartEvent").bind(() => {
      this.dynamicAudioOutput.initialize(24000);
      this.microphoneRecorder.setSampleRate(16000);
      this.createGeminiLiveSession();
    });

    // Display internet connection status
    this.textDisplay.text = global.deviceInfoSystem.isInternetAvailable()
      ? "Websocket connected"
      : "No internet";

    global.deviceInfoSystem.onInternetStatusChanged.add((args) => {
      this.textDisplay.text = args.isInternetAvailable
        ? "Reconnected to internete"
        : "No internet";
    });
  }

  createGeminiLiveSession() {
    let GeminiLive = Gemini.liveConnect();

    GeminiLive.onOpen.add((event) => {
      print("Connection opened");

      let generationConfig: GeminiTypes.Common.GenerationConfig = {
        responseModalities: ["AUDIO"],
        temperature: 1,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.voice,
            },
          },
        },
      };

      if (!this.haveAudioOutput) {
        generationConfig = {
          responseModalities: ["TEXT"],
        };
      }

      // Define a tool for changing text color
      const tools = [
        {
          function_declarations: [
            {
              name: "change_text_color",
              description: "Changes the color of the displayed text",
              parameters: {
                type: "object",
                properties: {
                  r: {
                    type: "number",
                    description:
                      "Value for the red component of the color (0-255)",
                  },
                  g: {
                    type: "number",
                    description:
                      "Value for the green component of the color (0-255)",
                  },
                  b: {
                    type: "number",
                    description:
                      "Value for the blue component of the color (0-255)",
                  },
                },
                required: ["r", "g", "b"],
              },
            },
          ],
        },
      ];

      // Send the session setup message
      let modelUri = `models/gemini-2.0-flash-live-preview-04-09`;
      const sessionSetupMessage: GeminiTypes.Live.Setup = {
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
      };
      GeminiLive.send(sessionSetupMessage);
    });

    let completedTextDisplay = true;

    GeminiLive.onMessage.add((message) => {
      print("Received message: " + JSON.stringify(message));
      // Setup complete, begin sending data
      if (message.setupComplete) {
        message = message as GeminiTypes.Live.SetupCompleteEvent;
        print("Setup complete");
        // Process microphone input to send to the server
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
          GeminiLive.send(message);
        });

        // Configure the microphone
        this.microphoneRecorder.onAudioFrame.add((audioFrame) => {
          this.audioProcessor.processFrame(audioFrame);
        });

        this.microphoneRecorder.startRecording();

        if (this.haveVideoInput) {
          // Configure the video controller
          this.videoController.onEncodedFrame.add((encodedFrame) => {
            //print(encodedFrame)
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
            GeminiLive.send(message);
          });

          this.videoController.startRecording();
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

        // Show output transcription
        else if (message?.serverContent?.outputTranscription?.text) {
          if (completedTextDisplay) {
            this.textDisplay.text =
              message.serverContent.outputTranscription.text;
          } else {
            this.textDisplay.text +=
              message.serverContent.outputTranscription.text;
          }
          completedTextDisplay = false;
        }

        // Show text response
        else if (message?.serverContent?.modelTurn?.parts?.[0]?.text) {
          if (completedTextDisplay) {
            this.textDisplay.text =
              message.serverContent.modelTurn.parts[0].text;
          } else {
            this.textDisplay.text +=
              message.serverContent.modelTurn.parts[0].text;
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
          if (functionCall.name === "change_text_color") {
            const args = functionCall.args;
            this.textDisplay.textFill.color = new vec4(
              args.r / 255,
              args.g / 255,
              args.b / 255,
              1
            );

            // Send a message back to the server indicating the function call was successful
            const messageToSend: GeminiTypes.Live.ToolResponse = {
              tool_response: {
                function_responses: [
                  {
                    name: functionCall.name,
                    response: { content: "Successfully changed text color" },
                  },
                ],
              },
            };

            GeminiLive.send(messageToSend);
          }
        });
      }
    });

    GeminiLive.onError.add((event) => {
      print("Error: " + event);
    });

    GeminiLive.onClose.add((event) => {
      print("Connection closed: " + event.reason);
    });
  }
}
