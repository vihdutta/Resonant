export function promisify<A extends unknown[], R>(
  target: unknown,
  fn: (...args: [...A, (result: R) => void]) => void,
  ...args: A
): Promise<R> {
  return new Promise((resolve) => {
    fn.call(target, ...args, resolve);
  });
}

export function promisifyWithReject<A extends unknown[], R>(
  target: unknown,
  fn: (...args: [...A, (result: R) => void, (error: string) => void]) => void,
  ...args: A
): Promise<R> {
  return new Promise((resolve, reject) => {
    fn.call(target, ...args, resolve, reject);
  });
}

export namespace Promisfy.RemoteServiceModule {
  export function performApiRequest(
    self: RemoteServiceModule,
    request: RemoteApiRequest
  ): Promise<RemoteApiResponse> {
    return promisify(self, self.performApiRequest, request);
  }
}

// setTimeout(callback: () => void, time: number) {
//   let delayedEvent = this.createEvent("DelayedCallbackEvent");
//   delayedEvent.reset(time / 1000);
//   delayedEvent.bind((eventData: any) => {
//     callback();
//   });
// }
// promiseSetTimeout(time: number): Promise<void> {
//   return new Promise((resolve) => {
//     this.setTimeout(() => {
//       resolve();
//     }, time);
//   });
// }
export namespace Promisfy.RemoteMediaModule {
  export function loadResourceAsImageTexture(
    self: RemoteMediaModule,
    resource: DynamicResource
  ): Promise<Texture> {
    return promisifyWithReject(self, self.loadResourceAsImageTexture, resource);
  }

  export function loadResourceAsVideoTexture(
    self: RemoteMediaModule,
    resource: DynamicResource
  ): Promise<Texture> {
    return promisifyWithReject(self, self.loadResourceAsVideoTexture, resource);
  }

  export function loadResourceAsGltfAsset(
    self: RemoteMediaModule,
    resource: DynamicResource
  ): Promise<GltfAsset> {
    return promisifyWithReject(self, self.loadResourceAsGltfAsset, resource);
  }

  export function loadResourceAsAudioTrackAsset(
    self: RemoteMediaModule,
    resource: DynamicResource
  ): Promise<AudioTrackAsset> {
    return promisifyWithReject(
      self,
      self.loadResourceAsAudioTrackAsset,
      resource
    );
  }
}
