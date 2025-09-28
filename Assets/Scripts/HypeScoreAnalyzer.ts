import { Gemini } from "Remote Service Gateway.lspkg/HostedExternal/Gemini";
import { GeminiTypes } from "Remote Service Gateway.lspkg/HostedExternal/GeminiTypes";
import { GeminiAssistant } from "./GeminiAssistant";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";

@component
export class HypeScoreAnalyzer extends BaseScriptComponent {
  @ui.separator
  @ui.label("Hype Score Analyzer - Analyzes text from Gemini Live to determine crowd hype level")
  @ui.separator
  
  @ui.group_start("Setup")
  @input private geminiAssistant: GeminiAssistant;
  @ui.group_end
  
  @ui.separator
  @ui.group_start("Hype Score Display")
  @input private hypeTextComponent: Text;
  @ui.group_end
  
  @ui.separator
  @ui.group_start("Settings")
  @input private updateInterval: number = 3.0; // seconds between hype score updates
  @input private enableDebugLogging: boolean = true;
  @input private currentHypeScore: Text; // Text component to display the score
  @input private responsiveness: number = 0.3; // How quickly score adapts (0.1 = slow, 1.0 = instant)
  @input private volatility: number = 0.8; // How much the score can fluctuate (0.1 = stable, 1.0 = wild)
  @ui.group_end
  private lastAnalyzedText: string = "";
  private updateTimer: any = null;
  private isAnalyzing: boolean = false;
  private scoreHistory: number[] = []; // Track recent scores for momentum
  private lastUpdateTime: number = 0;
  
  public hypeScoreUpdateEvent: Event<{ score: number; text: string }> = 
    new Event<{ score: number; text: string }>();

  onAwake() {
    // Initialize hype score to neutral 50
    if (this.currentHypeScore) {
      this.currentHypeScore.text = "50";
    }
    
    // Initialize timing and history
    this.lastUpdateTime = Date.now();
    this.scoreHistory = [50]; // Start with neutral score in history
    
    // Subscribe to text updates from GeminiAssistant
    if (this.geminiAssistant) {
      this.geminiAssistant.updateTextEvent.add((data) => {
        if (data.completed && data.text && data.text !== this.lastAnalyzedText) {
          this.scheduleHypeAnalysis(data.text);
        }
      });
    }
    
    // Initialize hype score display
    this.updateHypeDisplay();
  }

  private scheduleHypeAnalysis(text: string): void {
    // Clear existing timer
    if (this.updateTimer) {
      this.updateTimer.cancelled = true;
    }
    
    // Schedule analysis after a short delay to avoid spam
    this.updateTimer = setTimeout(() => {
      this.analyzeHypeScore(text);
    }, this.updateInterval * 1000);
  }

  private analyzeHypeScore(text: string): void {
    if (this.isAnalyzing || !text || text === this.lastAnalyzedText) {
      return;
    }
    
    this.isAnalyzing = true;
    this.lastAnalyzedText = text;
    
    if (this.enableDebugLogging) {
      print(`Analyzing hype score for text: "${text}"`);
    }

    const hypeAnalysisPrompt = `Analyze this DJ/crowd feedback text and rate the hype level on a scale of 1-100 (where 1 is dead crowd, 50 is neutral, 100 is maximum hype). Only respond with a single number between 1 and 100, nothing else.

Text to analyze: "${text}"

Hype Score (1-100):`;

    // Create a simple Gemini request for hype analysis
    const request: GeminiTypes.Models.GenerateContentRequest = {
      model: 'gemini-2.0-flash',
      type: 'generateContent',
      body: {
        contents: [{
          parts: [{
            text: hypeAnalysisPrompt
          }],
          role: 'user'
        }],
        generationConfig: {
          temperature: 0.3, // Lower temperature for more consistent scoring
          maxOutputTokens: 10, // We only want a number
        }
      }
    };

    Gemini.models(request)
      .then((response) => {
        if (response && response.candidates && response.candidates[0] && 
            response.candidates[0].content && response.candidates[0].content.parts && 
            response.candidates[0].content.parts[0]) {
          
          const scoreText = response.candidates[0].content.parts[0].text.trim();
          const parsedScore = parseInt(scoreText);
          
          if (!isNaN(parsedScore) && parsedScore >= 1 && parsedScore <= 100) {
            // Get current score as number for mathematical comparisons
            const currentScore = parseInt(this.currentHypeScore.text) || 50;
            const targetScore = parsedScore;
            
            // Calculate dynamic new score using adaptive equation
            const finalScore = this.calculateDynamicScore(currentScore, targetScore);
            
            // Update score history for momentum tracking
            this.updateScoreHistory(finalScore);
            
            // Set as text
            this.currentHypeScore.text = finalScore.toString();
            
            if (this.enableDebugLogging) {
              print(`Hype score updated: ${finalScore} (target: ${targetScore}, momentum: ${this.getMomentum().toFixed(2)})`);
            }
            
            this.updateHypeDisplay();
            this.hypeScoreUpdateEvent.invoke({ 
              score: finalScore, 
              text: text 
            });
            
          } else {
            if (this.enableDebugLogging) {
              print(`Invalid hype score received: "${scoreText}"`);
            }
          }
        }
        this.isAnalyzing = false;
      })
      .catch((error) => {
        if (this.enableDebugLogging) {
          print(`Error analyzing hype score: ${error}`);
        }
        this.isAnalyzing = false;
      });
  }

  private calculateDynamicScore(currentScore: number, targetScore: number): number {
    const now = Date.now();
    const timeDelta = (now - this.lastUpdateTime) / 1000; // seconds since last update
    this.lastUpdateTime = now;
    
    // Base difference between current and target
    const scoreDifference = targetScore - currentScore;
    
    // Calculate momentum factor (positive = upward trend, negative = downward trend)
    const momentum = this.getMomentum();
    
    // Time-based decay factor - longer gaps between updates reduce responsiveness
    const timeDecay = Math.min(1.0, Math.max(0.1, 1.0 / (1.0 + timeDelta * 0.1)));
    
    // Volatility-adjusted change rate
    const baseChangeRate = this.responsiveness * timeDecay;
    
    // Momentum amplification - if we're trending in the same direction, amplify the change
    const momentumAlignment = Math.sign(momentum) === Math.sign(scoreDifference) ? 1.2 : 0.8;
    const adjustedChangeRate = baseChangeRate * momentumAlignment;
    
    // Calculate the actual change amount
    let changeAmount = scoreDifference * adjustedChangeRate;
    
    // Apply volatility - higher volatility allows bigger jumps
    const maxChange = 5 + (this.volatility * 25); // Range: 5-30 based on volatility setting
    changeAmount = Math.sign(changeAmount) * Math.min(Math.abs(changeAmount), maxChange);
    
    // Add some randomness for organic feel (small amount)
    const randomFactor = (Math.random() - 0.5) * this.volatility * 2;
    changeAmount += randomFactor;
    
    // Calculate final score
    let newScore = currentScore + changeAmount;
    
    // Apply momentum influence - if momentum is strong, slightly bias toward the trend
    if (Math.abs(momentum) > 2) {
      const momentumInfluence = momentum * 0.1 * this.volatility;
      newScore += momentumInfluence;
    }
    
    // Clamp to valid range
    return Math.round(Math.max(1, Math.min(100, newScore)));
  }
  
  private updateScoreHistory(score: number): void {
    this.scoreHistory.push(score);
    
    // Keep only recent history (last 10 updates)
    if (this.scoreHistory.length > 10) {
      this.scoreHistory.shift();
    }
  }
  
  private getMomentum(): number {
    if (this.scoreHistory.length < 3) {
      return 0; // Not enough data for momentum
    }
    
    // Calculate average change over recent history
    let totalChange = 0;
    for (let i = 1; i < this.scoreHistory.length; i++) {
      totalChange += this.scoreHistory[i] - this.scoreHistory[i - 1];
    }
    
    return totalChange / (this.scoreHistory.length - 1);
  }

  private updateHypeDisplay(): void {
    if (this.hypeTextComponent && this.currentHypeScore) {
      const currentScore = parseInt(this.currentHypeScore.text) || 50;
      const hypeLevel = this.getHypeLevelText(currentScore);
      const momentum = this.getMomentum();
      const trendIndicator = momentum > 1 ? "📈" : momentum < -1 ? "📉" : "➡️";
      this.hypeTextComponent.text = `HYPE: ${this.currentHypeScore.text}/100 (${hypeLevel}) ${trendIndicator}`;
    }
  }

  private getHypeLevelText(score: number): string {
    if (score >= 90) return "🔥 INSANE";
    if (score >= 80) return "🚀 PUMPED";
    if (score >= 70) return "⚡ HYPED";
    if (score >= 60) return "👍 GOOD";
    if (score >= 40) return "😐 MEH";
    if (score >= 20) return "😴 LOW";
    return "💀 DEAD";
  }

  // Public methods for external control
  public getCurrentHypeScore(): number {
    return parseInt(this.currentHypeScore.text) || 50;
  }

  public setHypeScore(score: number): void {
    const clampedScore = Math.max(1, Math.min(100, score));
    this.currentHypeScore.text = clampedScore.toString();
    this.updateHypeDisplay();
    this.hypeScoreUpdateEvent.invoke({ 
      score: clampedScore, 
      text: "Manual override" 
    });
  }

  public resetHypeScore(): void {
    this.currentHypeScore.text = "50";
    this.updateHypeDisplay();
    this.hypeScoreUpdateEvent.invoke({ 
      score: 50, 
      text: "Reset to neutral" 
    });
  }
}
