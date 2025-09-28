import { Gemini } from "../Gemini";
import { GeminiTypes } from "../GeminiTypes";

@component
export class ExampleGeminiCalls extends BaseScriptComponent {
  @ui.separator
  @ui.group_start("Text Generation Example")
  @input
  textDisplay: Text;
  @input
  @widget(new TextAreaWidget())
  private modelPrompt: string =
    "You are an incredibly smart but witty AI assistant who likes to answers life's greatest mysteries in under two sentences";
  @input
  @widget(new TextAreaWidget())
  private textPrompt: string = "Is a hotdog a sandwich?";
  @input
  @label("Run On Tap")
  private doTextGenerationOnTap: boolean = false;
  @ui.group_end
  @ui.separator
  @ui.group_start("Image Generation Example")
  @input
  private imgObject: SceneObject;
  @input
  @widget(new TextAreaWidget())
  private imageGenerationPrompt: string = "The future of augmented reality";
  @input
  @label("Run On Tap")
  private generateImageOnTap: boolean = false;
  @ui.group_end
  @ui.separator
  @ui.group_start("Function Calling Example")
  @input
  @widget(new TextAreaWidget())
  private functionCallingPrompt: string = "Make the text display yellow";
  @input
  @label("Run On Tap")
  private doFunctionCallingOnTap: boolean = false;
  @ui.group_end
  private gestureModule: GestureModule = require("LensStudio:GestureModule");

  onAwake() {
    if (global.deviceInfoSystem.isEditor()) {
      this.createEvent("TapEvent").bind(() => {
        this.onTap();
      });
    } else {
      this.gestureModule
        .getPinchDownEvent(GestureModule.HandType.Right)
        .add(() => {
          this.onTap();
        });
    }
  }

  private onTap() {
    if (this.generateImageOnTap) {
      this.generateImageExample();
    }

    if (this.doTextGenerationOnTap) {
      this.textToTextExample();
    }

    if (this.doFunctionCallingOnTap) {
      this.functionCallingExample();
    }
  }

  textToTextExample() {
    this.textDisplay.sceneObject.enabled = true;
    this.textDisplay.text = "Generating...";
    let request: GeminiTypes.Models.GenerateContentRequest = {
      model: "gemini-2.0-flash",
      type: "generateContent",
      body: {
        contents: [
          {
            parts: [
              {
                text: this.modelPrompt,
              },
            ],
            role: "model",
          },
          {
            parts: [
              {
                text: this.textPrompt,
              },
            ],
            role: "user",
          },
        ],
      },
    };

    Gemini.models(request)
      .then((response) => {
        print("Gemini response: " + JSON.stringify(response));
        this.textDisplay.text = response.candidates[0].content.parts[0].text;
      })
      .catch((error) => {
        print("Gemini error: " + error);
        this.textDisplay.text = "Error: " + error;
      });
  }

  generateImageExample() {
    this.imgObject.enabled = true;
    let request: GeminiTypes.Models.GenerateContentRequest = {
      model: "gemini-2.0-flash-preview-image-generation",
      type: "generateContent",
      body: {
        contents: [
          {
            parts: [
              {
                text: this.imageGenerationPrompt,
              },
            ],
            role: "user",
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      },
    };
    Gemini.models(request)
      .then((response) => {
        for (let part of response.candidates[0].content.parts) {
          if (part?.inlineData) {
            let b64Data = part.inlineData.data;
            Base64.decodeTextureAsync(
              b64Data,
              (texture) => {
                let imgComponent = this.imgObject.getComponent("Image");
                let imageMaterial = imgComponent.mainMaterial.clone();
                imgComponent.mainMaterial = imageMaterial;
                imgComponent.mainPass.baseTex = texture;
              },
              () => {
                print("Failed to decode texture from base64 data.");
              }
            );
          }
        }
      })
      .catch((error) => {
        print("Error while generating image: " + error);
        this.textDisplay.text = "Error: " + error;
      });
  }

  functionCallingExample() {
    this.textDisplay.sceneObject.enabled = true;
    this.textDisplay.text = "Processing function call...";

    let request: GeminiTypes.Models.GenerateContentRequest = {
      model: "gemini-2.0-flash",
      type: "generateContent",
      body: {
        contents: [
          {
            parts: [
              {
                text: this.functionCallingPrompt,
              },
            ],
            role: "user",
          },
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: "set_text_color",
                description: "Set the color of the text display",
                parameters: {
                  type: "object",
                  properties: {
                    red: {
                      type: "number",
                      description: "Red component of the color (0-255)",
                    },
                    green: {
                      type: "number",
                      description: "Green component of the color (0-255)",
                    },
                    blue: {
                      type: "number",
                      description: "Blue component of the color (0-255)",
                    },
                  },
                  required: ["red", "green", "blue"],
                },
              },
            ],
          },
        ],
      },
    };

    Gemini.models(request)
      .then((response) => {
        print("Gemini function call response: " + JSON.stringify(response));

        // Check for function calls in the response
        const functionCalls =
          response.candidates[0]?.content?.parts?.[0]?.functionCall;

        if (functionCalls && functionCalls.name === "set_text_color") {
          try {
            const args = functionCalls.args;
            const r = args.red || 0;
            const g = args.green || 0;
            const b = args.blue || 0;

            // Set the text color
            this.textDisplay.textFill.color = new vec4(
              r / 255,
              g / 255,
              b / 255,
              1
            );

            this.textDisplay.text = `Text color set to RGB(${r}, ${g}, ${b})`;
          } catch (e) {
            this.textDisplay.text = "Error parsing function arguments: " + e;
          }
        } else {
          // If no function call was made, display the regular text response
          const textResponse =
            response.candidates[0]?.content?.parts?.[0]?.text;
          if (textResponse) {
            this.textDisplay.text = textResponse;
          } else {
            this.textDisplay.text =
              "No function call or text response received";
          }
        }
      })
      .catch((error) => {
        print("Gemini function call error: " + error);
        this.textDisplay.text = "Error: " + error;
      });
  }
}
