import { DeepSeek } from "../Deepseek";
import { DeepSeekTypes } from "../DeepSeekTypes";

@component
export class ExampleDeepseekCalls extends BaseScriptComponent {
  @ui.separator
  @ui.group_start("Chat Completions Example")
  @input
  textDisplay: Text;
  @input
  @widget(new TextAreaWidget())
  // DeepSeek-R1 is a reasoning model. Adding this prompt reduces reasoning for faster response.
  private systemPrompt: string =
    "Give your reasoning in no more than one sentence.";
  @input
  @widget(new TextAreaWidget())
  private userPrompt: string = "Is a hotdog a sandwich";
  @input
  private runOnTap: boolean = false;
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
    if (this.runOnTap) {
      this.doChatCompletions();
    }
  }
  doChatCompletions() {
    this.textDisplay.sceneObject.enabled = true;
    this.textDisplay.text = "Generating...";
    let messageArray: Array<DeepSeekTypes.ChatCompletions.Message> = [
      {
        role: "system",
        content: this.systemPrompt,
      },
      {
        role: "user",
        content: this.userPrompt,
      },
    ];

    const deepSeekRequest: DeepSeekTypes.ChatCompletions.Request = {
      model: "DeepSeek-R1",
      messages: messageArray,
      max_tokens: 2048,
      temperature: 0.7,
    };

    DeepSeek.chatCompletions(deepSeekRequest)
      .then((response) => {
        let reasoningContent = response?.choices[0]?.message?.reasoning_content;
        let messageContent = response?.choices[0]?.message?.content;
        this.textDisplay.text = "Reasoning: " + reasoningContent + "\n\n";
        this.textDisplay.text += "Final answer: " + messageContent;
      })
      .catch((error) => {
        this.textDisplay.text = "Error: " + error;
      });
  }
}
