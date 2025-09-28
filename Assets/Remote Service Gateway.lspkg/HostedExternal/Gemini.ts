import {
    AvaliableApiTypes,
    RemoteServiceGatewayCredentials,
} from "../RemoteServiceGatewayCredentials";

import Event from "../Utils/Event";

import { GeminiTypes } from "./GeminiTypes";

const RSM_GEMINISYNC = requireAsset(
    "./RemoteServiceModules/Gemini_Sync.remoteServiceModule"
) as RemoteServiceModule

const RSM_GEMINILIVE = requireAsset(
    "./RemoteServiceModules/Gemini_Live.remoteServiceModule"
) as RemoteServiceModule

export class Gemini {
    /**
     * Performs a synchronous request to the Gemini API to generate content.
     * @param geminiRequest The request object containing the model and content generation parameters.
     * @returns A promise that resolves with the Gemini content generation response.
     * @link https://ai.google.dev/api/generate-content
     */
    static models(
        geminiRequest: GeminiTypes.Models.GenerateContentRequest
    ): Promise<GeminiTypes.Models.GenerateContentResponse>{
        return new Promise((resolve, reject) => {
            var submitApiRequest = RemoteApiRequest.create();
            let apiToken = RemoteServiceGatewayCredentials.getApiToken(
                    AvaliableApiTypes.Gemini
            );
            submitApiRequest.endpoint = "models";
            submitApiRequest.parameters = {
                "api-token": apiToken,
                "model": geminiRequest.model,
                "type": geminiRequest.type,
            }
            let textBody = JSON.stringify(geminiRequest.body)
            submitApiRequest.body = textBody
            RSM_GEMINISYNC.performApiRequest(submitApiRequest, (response) => {
                if (response.statusCode == 1) {
                    let bodyJson = JSON.parse(response.body) as GeminiTypes.Models.GenerateContentResponse;
                    resolve(bodyJson);
                } else {
                    print("Error: " + response.body);
                    reject(response.body);
                }
            })
        })
    }

    /**
     * Creates a live connection to the Gemini API for real-time interactions.
     * @returns An instance of GeminiLiveWebsocket for managing the live connection.
     * @link https://ai.google.dev/api/live
     */
    static liveConnect(){
        return new GeminiLiveWebsocket();
    }
}

export class GeminiLiveWebsocket {
  private _websocket: WebSocket;

  /**
   * Event triggered when a message is received from the Gemini live API.
   * @type {Event<GeminiTypes.Live.ServerMessage>}
   */
  public onMessage = new Event<GeminiTypes.Live.ServerMessage>();
  public onError = new Event<WebSocketEvent>();
  public onOpen = new Event<WebSocketEvent>();
  public onClose = new Event<WebSocketCloseEvent>();

  constructor() {
    this.connect();
  }

  private connect(){
    let apiToken = RemoteServiceGatewayCredentials.getApiToken(
      AvaliableApiTypes.Gemini
    );

    this._websocket = RSM_GEMINILIVE.createAPIWebSocket("live_api", { 
      "api-token": apiToken,
    });
    
    this._websocket.addEventListener("error", (event) => {
      this.onError.invoke(event);
    });

    this._websocket.addEventListener("message", (event: WebSocketMessageEvent) => {
      let messageData = event.data.toString();
      let parsedMessage = JSON.parse(messageData) as GeminiTypes.Live.ServerMessage;
      this.onMessage.invoke(parsedMessage);
    });

    this._websocket.addEventListener("open", (event) => {
      this.onOpen.invoke(event);
    });

    this._websocket.addEventListener("close", (event: WebSocketCloseEvent) => {
      this.onClose.invoke(event);
    });
  }

  /**
   * Sends a message to the Gemini live API.
   * @param message The message to send, formatted as a GeminiTypes.Live.ClientMessage.
   */
  send(message: GeminiTypes.Live.ClientMessage){
    if(this._websocket.readyState == WebSocketReadyState.OPEN){
      this._websocket.send(JSON.stringify(message));
    }
  }

  /**
   * Overrides the default send method to allow sending raw messages.
   * @param message The raw message to send.
   */
  overrideSend(message: any){
    if(this._websocket.readyState == WebSocketReadyState.OPEN){
      this._websocket.send(message);
    }
  }

  /**
   * Checks if the WebSocket connection is currently connected.
   * @returns {boolean} True if the WebSocket is connected, false otherwise.
   */
  isConnected(){
    return this._websocket.readyState == WebSocketReadyState.OPEN;
  }

  /**
   * Closes the WebSocket connection.
   */
  close(){
    this._websocket.close();
  }
}

enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}