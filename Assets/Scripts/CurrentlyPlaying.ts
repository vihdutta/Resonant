import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";

interface SongData {
  artist_1: string;
  artist_2: string;
  title_1: string;
  title_2: string;
  queue?: string[];
}

@component
export class CurrentlyPlaying extends BaseScriptComponent {
  @ui.separator
  @ui.label("Currently Playing - Fetches live song data from API")
  @ui.separator
  
  @ui.group_start("Setup")
  @input internetModule: InternetModule;
  @ui.group_end
  
  @ui.separator
  @ui.group_start("Song Widget 1")
  @input private songWidget1Image: Image; // For song 1 image component
  @input private songWidget1Song: Text;   // For song 1 title and artist
  @ui.group_end
  
  @ui.separator
  @ui.group_start("Song Widget 2") 
  @input private songWidget2Image: Image; // For song 2 image component
  @input private songWidget2Song: Text;   // For song 2 title and artist
  @ui.group_end
  
  @ui.separator
  @ui.group_start("Settings")
  @input private updateInterval: number = 1.0; // Update every second
  @input private enableDebugLogging: boolean = true;
  @input private apiUrl: string = "https://vihdutta.pythonanywhere.com/";
  @ui.group_end
  
  private updateTimer: any = null;
  private isUpdating: boolean = false;
  private lastSongData: SongData | null = null;

  onAwake() {
    // Check if InternetModule is provided
    if (!this.internetModule) {
      print("ERROR: InternetModule not assigned! Please drag the InternetModule asset to the internetModule input in the inspector.");
      this.handleConnectionError("InternetModule not assigned");
      return;
    }
    
    // Initialize with default values
    this.initializeWidgets();
    
    // Start periodic updates
    this.startPeriodicUpdates();
    
    // Do initial fetch
    this.fetchCurrentlyPlaying();
  }

  private initializeWidgets(): void {
    if (this.songWidget1Song) {
      this.songWidget1Song.text = "Loading...";
    }
    if (this.songWidget2Song) {
      this.songWidget2Song.text = "Loading...";
    }
    // Image components will be set when song data is loaded
  }

  private startPeriodicUpdates(): void {
    // Clear any existing timer
    this.stopPeriodicUpdates();
    
    if (this.enableDebugLogging) {
      print(`Starting periodic song updates every ${this.updateInterval} seconds`);
    }
    
    // Create recursive timeout for periodic fetching
    const scheduleNext = () => {
      this.updateTimer = setTimeout(() => {
        this.fetchCurrentlyPlaying();
        scheduleNext(); // Schedule next update
      }, this.updateInterval * 1000);
    };
    
    scheduleNext();
  }

  private stopPeriodicUpdates(): void {
    if (this.updateTimer) {
      this.updateTimer.cancelled = true;
      this.updateTimer = null;
      if (this.enableDebugLogging) {
        print("Periodic song updates stopped");
      }
    }
  }

  private async fetchCurrentlyPlaying(): Promise<void> {
    if (this.isUpdating) {
      return;
    }
    
    if (!this.internetModule) {
      if (this.enableDebugLogging) {
        print("Cannot fetch: InternetModule not available");
      }
      this.handleConnectionError("InternetModule not assigned");
      return;
    }
    
    this.isUpdating = true;
    
    try {
      if (this.enableDebugLogging) {
        print(`Fetching currently playing from: ${this.apiUrl}`);
      }
      
      // Check internet availability
      if (!global.deviceInfoSystem.isInternetAvailable()) {
        if (this.enableDebugLogging) {
          print("No internet connection available");
        }
        this.handleConnectionError("No internet connection");
        return;
      }
      
      // Create fetch request
      const request = new Request(this.apiUrl, {
        method: 'GET',
      });
      
      const response = await this.internetModule.fetch(request);
      
      if (response.status === 200) {
        const responseText = await response.text();
        
        if (this.enableDebugLogging) {
          print(`API Response: ${responseText}`);
        }
        
        try {
          const songData: SongData = JSON.parse(responseText);
          this.updateSongWidgets(songData);
        } catch (parseError) {
          if (this.enableDebugLogging) {
            print(`JSON parse error: ${parseError}`);
          }
          this.handleConnectionError("Invalid JSON response");
        }
        
      } else {
        if (this.enableDebugLogging) {
          print(`API request failed with status: ${response.status}`);
        }
        this.handleConnectionError(`API Error: ${response.status}`);
      }
      
    } catch (error) {
      if (this.enableDebugLogging) {
        print(`Fetch error: ${error}`);
      }
      this.handleConnectionError("Network error");
    } finally {
      this.isUpdating = false;
    }
  }

  private updateSongWidgets(songData: SongData): void {
    // Check if data has actually changed
    if (this.lastSongData && 
        this.lastSongData.artist_1 === songData.artist_1 &&
        this.lastSongData.title_1 === songData.title_1 &&
        this.lastSongData.artist_2 === songData.artist_2 &&
        this.lastSongData.title_2 === songData.title_2) {
      // No changes, skip update
      return;
    }
    
    // Update Song Widget 1
    if (this.songWidget1Song) {
      this.songWidget1Song.text = `${songData.artist_1} - ${songData.title_1}`;
    }
    if (this.songWidget1Image) {
      // Load texture from Assets/Images/{title}.jpg
      const texture1 = this.loadSongTexture(songData.title_1);
      if (texture1) {
        this.songWidget1Image.mainPass.baseTex = texture1;
      }
    }
    
    // Update Song Widget 2  
    if (this.songWidget2Song) {
      this.songWidget2Song.text = `${songData.artist_2} - ${songData.title_2}`;
    }
    if (this.songWidget2Image) {
      // Load texture from Assets/Images/{title}.jpg
      const texture2 = this.loadSongTexture(songData.title_2);
      if (texture2) {
        this.songWidget2Image.mainPass.baseTex = texture2;
      }
    }
    
    // Store last data for comparison
    this.lastSongData = songData;
    
    if (this.enableDebugLogging) {
      print(`Updated widgets - Song 1: ${songData.artist_1} - ${songData.title_1}, Song 2: ${songData.artist_2} - ${songData.title_2}`);
    }
  }

  private loadSongTexture(title: string): Texture | null {
    try {
      if (this.enableDebugLogging) {
        print(`Attempting to load texture for song: ${title}`);
      }
      
      // In Lens Studio, textures need to be pre-imported and referenced
      // For now, we'll return null and log the attempt
      // The actual texture loading would need to be done through the inspector
      // or by using pre-assigned texture arrays
      
      if (this.enableDebugLogging) {
        print(`Texture loading not implemented yet for: ${title}.jpg`);
        print(`Expected file: Assets/Images/${title}.jpg`);
      }
      
      return null;
      
    } catch (error) {
      if (this.enableDebugLogging) {
        print(`Error loading texture for title "${title}": ${error}`);
      }
      return null;
    }
  }

  private handleConnectionError(errorMessage: string): void {
    // Update widgets to show error state
    if (this.songWidget1Song) {
      this.songWidget1Song.text = errorMessage;
    }
    if (this.songWidget2Song) {
      this.songWidget2Song.text = errorMessage;
    }
    // Image components will keep their current texture on error
    // Could optionally set to a default error texture if available
  }

  // Public methods for external control
  public forceUpdate(): void {
    if (this.enableDebugLogging) {
      print("Force updating currently playing data");
    }
    this.fetchCurrentlyPlaying();
  }

  public setUpdateInterval(seconds: number): void {
    this.updateInterval = Math.max(0.5, seconds); // Minimum 0.5 seconds
    this.startPeriodicUpdates(); // Restart with new interval
  }

  public toggleUpdates(enabled: boolean): void {
    if (enabled) {
      this.startPeriodicUpdates();
    } else {
      this.stopPeriodicUpdates();
    }
  }

  // Getters for current song data
  public getCurrentSong1(): string {
    return this.songWidget1Song ? this.songWidget1Song.text : "";
  }

  public getCurrentSong2(): string {
    return this.songWidget2Song ? this.songWidget2Song.text : "";
  }

  public getCurrentTexture1(): Texture | null {
    return this.songWidget1Image ? this.songWidget1Image.mainPass.baseTex : null;
  }

  public getCurrentTexture2(): Texture | null {
    return this.songWidget2Image ? this.songWidget2Image.mainPass.baseTex : null;
  }

  onDestroy() {
    // Clean up timer when component is destroyed
    this.stopPeriodicUpdates();
  }
}
