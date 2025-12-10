const featureLoader = require("./services/feature-loader");
const featureExecutor = require("./services/feature-executor");
const featureVerifier = require("./services/feature-verifier");
const contextManager = require("./services/context-manager");
const projectAnalyzer = require("./services/project-analyzer");

/**
 * Auto Mode Service - Autonomous feature implementation
 * Automatically picks and implements features from the kanban board
 *
 * This service acts as the main orchestrator, delegating work to specialized services:
 * - featureLoader: Loading and selecting features
 * - featureExecutor: Implementing features
 * - featureVerifier: Running tests and verification
 * - contextManager: Managing context files
 * - projectAnalyzer: Analyzing project structure
 */
class AutoModeService {
  constructor() {
    // Track multiple concurrent feature executions
    this.runningFeatures = new Map(); // featureId -> { abortController, query, projectPath, sendToRenderer }
    this.autoLoopRunning = false; // Separate flag for the auto loop
    this.autoLoopAbortController = null;
  }

  /**
   * Helper to create execution context with isActive check
   */
  createExecutionContext(featureId) {
    const context = {
      abortController: null,
      query: null,
      projectPath: null,
      sendToRenderer: null,
      isActive: () => this.runningFeatures.has(featureId),
    };
    return context;
  }

  /**
   * Start auto mode - continuously implement features
   */
  async start({ projectPath, sendToRenderer }) {
    if (this.autoLoopRunning) {
      throw new Error("Auto mode loop is already running");
    }

    this.autoLoopRunning = true;

    console.log("[AutoMode] Starting auto mode for project:", projectPath);

    // Run the autonomous loop
    this.runLoop(projectPath, sendToRenderer).catch((error) => {
      console.error("[AutoMode] Loop error:", error);
      this.stop();
    });

    return { success: true };
  }

  /**
   * Stop auto mode - stops the auto loop and all running features
   */
  async stop() {
    console.log("[AutoMode] Stopping auto mode");

    this.autoLoopRunning = false;

    // Abort auto loop if running
    if (this.autoLoopAbortController) {
      this.autoLoopAbortController.abort();
      this.autoLoopAbortController = null;
    }

    // Abort all running features
    for (const [featureId, execution] of this.runningFeatures.entries()) {
      console.log(`[AutoMode] Aborting feature: ${featureId}`);
      if (execution.abortController) {
        execution.abortController.abort();
      }
    }

    // Clear all running features
    this.runningFeatures.clear();

    return { success: true };
  }

  /**
   * Get status of auto mode
   */
  getStatus() {
    return {
      autoLoopRunning: this.autoLoopRunning,
      runningFeatures: Array.from(this.runningFeatures.keys()),
      runningCount: this.runningFeatures.size,
    };
  }

  /**
   * Run a specific feature by ID
   */
  async runFeature({ projectPath, featureId, sendToRenderer }) {
    // Check if this specific feature is already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    console.log(`[AutoMode] Running specific feature: ${featureId}`);

    // Register this feature as running
    const execution = this.createExecutionContext(featureId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(featureId, execution);

    try {
      // Load features
      const features = await featureLoader.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      console.log(`[AutoMode] Running feature: ${feature.description}`);

      // Update feature status to in_progress
      await featureLoader.updateFeatureStatus(
        featureId,
        "in_progress",
        projectPath
      );

      sendToRenderer({
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: feature,
      });

      // Implement the feature
      const result = await featureExecutor.implementFeature(
        feature,
        projectPath,
        sendToRenderer,
        execution
      );

      // Update feature status based on result
      // For skipTests features, go to waiting_approval on success instead of verified
      let newStatus;
      if (result.passes) {
        newStatus = feature.skipTests ? "waiting_approval" : "verified";
      } else {
        newStatus = "backlog";
      }
      await featureLoader.updateFeatureStatus(
        feature.id,
        newStatus,
        projectPath
      );

      // Delete context file only if verified (not for waiting_approval)
      if (newStatus === "verified") {
        await contextManager.deleteContextFile(projectPath, feature.id);
      }

      sendToRenderer({
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: result.passes,
        message: result.message,
      });

      return { success: true, passes: result.passes };
    } catch (error) {
      console.error("[AutoMode] Error running feature:", error);
      sendToRenderer({
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      throw error;
    } finally {
      // Clean up this feature's execution
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Verify a specific feature by running its tests
   */
  async verifyFeature({ projectPath, featureId, sendToRenderer }) {
    console.log(`[AutoMode] verifyFeature called with:`, {
      projectPath,
      featureId,
    });

    // Check if this specific feature is already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    console.log(`[AutoMode] Verifying feature: ${featureId}`);

    // Register this feature as running
    const execution = this.createExecutionContext(featureId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(featureId, execution);

    try {
      // Load features
      const features = await featureLoader.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      console.log(`[AutoMode] Verifying feature: ${feature.description}`);

      sendToRenderer({
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: feature,
      });

      // Verify the feature by running tests
      const result = await featureVerifier.verifyFeatureTests(
        feature,
        projectPath,
        sendToRenderer,
        execution
      );

      // Update feature status based on result
      const newStatus = result.passes ? "verified" : "in_progress";
      await featureLoader.updateFeatureStatus(
        featureId,
        newStatus,
        projectPath
      );

      // Delete context file if verified
      if (newStatus === "verified") {
        await contextManager.deleteContextFile(projectPath, featureId);
      }

      sendToRenderer({
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: result.passes,
        message: result.message,
      });

      return { success: true, passes: result.passes };
    } catch (error) {
      console.error("[AutoMode] Error verifying feature:", error);
      sendToRenderer({
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      throw error;
    } finally {
      // Clean up this feature's execution
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Resume a feature that has previous context - loads existing context and continues implementation
   */
  async resumeFeature({ projectPath, featureId, sendToRenderer }) {
    console.log(`[AutoMode] resumeFeature called with:`, {
      projectPath,
      featureId,
    });

    // Check if this specific feature is already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    console.log(`[AutoMode] Resuming feature: ${featureId}`);

    // Register this feature as running
    const execution = this.createExecutionContext(featureId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(featureId, execution);

    try {
      // Load features
      const features = await featureLoader.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      console.log(`[AutoMode] Resuming feature: ${feature.description}`);

      sendToRenderer({
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: feature,
      });

      // Read existing context
      const previousContext = await contextManager.readContextFile(
        projectPath,
        featureId
      );

      // Resume implementation with context
      const result = await featureExecutor.resumeFeatureWithContext(
        feature,
        projectPath,
        sendToRenderer,
        previousContext,
        execution
      );

      // If the agent ends early without finishing, automatically re-run
      let attempts = 0;
      const maxAttempts = 3;
      let finalResult = result;

      while (!finalResult.passes && attempts < maxAttempts) {
        // Check if feature is still in progress (not verified)
        const updatedFeatures = await featureLoader.loadFeatures(projectPath);
        const updatedFeature = updatedFeatures.find((f) => f.id === featureId);

        if (updatedFeature && updatedFeature.status === "in_progress") {
          attempts++;
          console.log(
            `[AutoMode] Feature ended early, auto-retrying (attempt ${attempts}/${maxAttempts})...`
          );

          // Update context file with retry message
          await contextManager.writeToContextFile(
            projectPath,
            featureId,
            `\n\n🔄 Auto-retry #${attempts} - Continuing implementation...\n\n`
          );

          sendToRenderer({
            type: "auto_mode_progress",
            featureId: feature.id,
            content: `\n🔄 Auto-retry #${attempts} - Agent ended early, continuing...\n`,
          });

          // Read updated context
          const retryContext = await contextManager.readContextFile(
            projectPath,
            featureId
          );

          // Resume again with full context
          finalResult = await featureExecutor.resumeFeatureWithContext(
            feature,
            projectPath,
            sendToRenderer,
            retryContext,
            execution
          );
        } else {
          break;
        }
      }

      // Update feature status based on final result
      // For skipTests features, go to waiting_approval on success instead of verified
      let newStatus;
      if (finalResult.passes) {
        newStatus = feature.skipTests ? "waiting_approval" : "verified";
      } else {
        newStatus = "in_progress";
      }
      await featureLoader.updateFeatureStatus(
        featureId,
        newStatus,
        projectPath
      );

      // Delete context file only if verified (not for waiting_approval)
      if (newStatus === "verified") {
        await contextManager.deleteContextFile(projectPath, featureId);
      }

      sendToRenderer({
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: finalResult.passes,
        message: finalResult.message,
      });

      return { success: true, passes: finalResult.passes };
    } catch (error) {
      console.error("[AutoMode] Error resuming feature:", error);
      sendToRenderer({
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      throw error;
    } finally {
      // Clean up this feature's execution
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Main autonomous loop - picks and implements features
   */
  async runLoop(projectPath, sendToRenderer) {
    while (this.autoLoopRunning) {
      let currentFeatureId = null;
      try {
        // Load features from .automaker/feature_list.json
        const features = await featureLoader.loadFeatures(projectPath);

        // Find highest priority incomplete feature
        const nextFeature = featureLoader.selectNextFeature(features);

        if (!nextFeature) {
          console.log("[AutoMode] No more features to implement");
          sendToRenderer({
            type: "auto_mode_complete",
            message: "All features completed!",
          });
          break;
        }

        currentFeatureId = nextFeature.id;

        // Skip if this feature is already running (via manual trigger)
        if (this.runningFeatures.has(currentFeatureId)) {
          console.log(
            `[AutoMode] Skipping ${currentFeatureId} - already running`
          );
          await this.sleep(3000);
          continue;
        }

        console.log(`[AutoMode] Selected feature: ${nextFeature.description}`);

        sendToRenderer({
          type: "auto_mode_feature_start",
          featureId: nextFeature.id,
          feature: nextFeature,
        });

        // Register this feature as running
        const execution = this.createExecutionContext(currentFeatureId);
        execution.projectPath = projectPath;
        execution.sendToRenderer = sendToRenderer;
        this.runningFeatures.set(currentFeatureId, execution);

        // Implement the feature
        const result = await featureExecutor.implementFeature(
          nextFeature,
          projectPath,
          sendToRenderer,
          execution
        );

        // Update feature status based on result
        // For skipTests features, go to waiting_approval on success instead of verified
        let newStatus;
        if (result.passes) {
          newStatus = nextFeature.skipTests ? "waiting_approval" : "verified";
        } else {
          newStatus = "backlog";
        }
        await featureLoader.updateFeatureStatus(
          nextFeature.id,
          newStatus,
          projectPath
        );

        // Delete context file only if verified (not for waiting_approval)
        if (newStatus === "verified") {
          await contextManager.deleteContextFile(projectPath, nextFeature.id);
        }

        sendToRenderer({
          type: "auto_mode_feature_complete",
          featureId: nextFeature.id,
          passes: result.passes,
          message: result.message,
        });

        // Clean up
        this.runningFeatures.delete(currentFeatureId);

        // Small delay before next feature
        if (this.autoLoopRunning) {
          await this.sleep(3000);
        }
      } catch (error) {
        console.error("[AutoMode] Error in loop iteration:", error);

        sendToRenderer({
          type: "auto_mode_error",
          error: error.message,
          featureId: currentFeatureId,
        });

        // Clean up on error
        if (currentFeatureId) {
          this.runningFeatures.delete(currentFeatureId);
        }

        // Wait before retrying
        await this.sleep(5000);
      }
    }

    console.log("[AutoMode] Loop ended");
    this.autoLoopRunning = false;
  }

  /**
   * Analyze a new project - scans codebase and updates app_spec.txt
   * This is triggered when opening a project for the first time
   */
  async analyzeProject({ projectPath, sendToRenderer }) {
    console.log(`[AutoMode] Analyzing project at: ${projectPath}`);

    const analysisId = `project-analysis-${Date.now()}`;

    // Check if already analyzing this project
    if (this.runningFeatures.has(analysisId)) {
      throw new Error("Project analysis is already running");
    }

    // Register as running
    const execution = this.createExecutionContext(analysisId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(analysisId, execution);

    try {
      sendToRenderer({
        type: "auto_mode_feature_start",
        featureId: analysisId,
        feature: {
          id: analysisId,
          category: "Project Analysis",
          description: "Analyzing project structure and tech stack",
        },
      });

      // Perform the analysis
      const result = await projectAnalyzer.runProjectAnalysis(
        projectPath,
        analysisId,
        sendToRenderer,
        execution
      );

      sendToRenderer({
        type: "auto_mode_feature_complete",
        featureId: analysisId,
        passes: result.success,
        message: result.message,
      });

      return { success: true, message: result.message };
    } catch (error) {
      console.error("[AutoMode] Error analyzing project:", error);
      sendToRenderer({
        type: "auto_mode_error",
        error: error.message,
        featureId: analysisId,
      });
      throw error;
    } finally {
      this.runningFeatures.delete(analysisId);
    }
  }

  /**
   * Stop a specific feature by ID
   */
  async stopFeature({ featureId }) {
    if (!this.runningFeatures.has(featureId)) {
      return { success: false, error: `Feature ${featureId} is not running` };
    }

    console.log(`[AutoMode] Stopping feature: ${featureId}`);

    const execution = this.runningFeatures.get(featureId);
    if (execution && execution.abortController) {
      execution.abortController.abort();
    }

    // Clean up
    this.runningFeatures.delete(featureId);

    return { success: true };
  }

  /**
   * Follow-up on a feature with additional prompt
   * This continues work on a feature that's in waiting_approval status
   */
  async followUpFeature({
    projectPath,
    featureId,
    prompt,
    imagePaths,
    sendToRenderer,
  }) {
    // Check if this feature is already running
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    console.log(
      `[AutoMode] Follow-up on feature: ${featureId} with prompt: ${prompt}`
    );

    // Register this feature as running
    const execution = this.createExecutionContext(featureId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(featureId, execution);

    // Start the async work in the background (don't await)
    // This allows the API to return immediately so the modal can close
    this.runFollowUpWork({
      projectPath,
      featureId,
      prompt,
      imagePaths,
      sendToRenderer,
      execution,
    }).catch((error) => {
      console.error("[AutoMode] Follow-up work error:", error);
      this.runningFeatures.delete(featureId);
    });

    // Return immediately so the frontend can close the modal
    return { success: true };
  }

  /**
   * Internal method to run follow-up work asynchronously
   */
  async runFollowUpWork({
    projectPath,
    featureId,
    prompt,
    imagePaths,
    sendToRenderer,
    execution,
  }) {
    try {
      // Load features
      const features = await featureLoader.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      console.log(`[AutoMode] Following up on feature: ${feature.description}`);

      // Update status to in_progress
      await featureLoader.updateFeatureStatus(
        featureId,
        "in_progress",
        projectPath
      );

      sendToRenderer({
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: feature,
      });

      // Read existing context and append follow-up prompt
      const previousContext = await contextManager.readContextFile(
        projectPath,
        featureId
      );

      // Append follow-up prompt to context
      const followUpContext = `${previousContext}\n\n## Follow-up Instructions\n\n${prompt}`;
      await contextManager.writeToContextFile(
        projectPath,
        featureId,
        `\n\n## Follow-up Instructions\n\n${prompt}`
      );

      // Resume implementation with follow-up context and optional images
      const result = await featureExecutor.resumeFeatureWithContext(
        { ...feature, followUpPrompt: prompt, followUpImages: imagePaths },
        projectPath,
        sendToRenderer,
        followUpContext,
        execution
      );

      // For skipTests features, go to waiting_approval on success instead of verified
      const newStatus = result.passes
        ? feature.skipTests
          ? "waiting_approval"
          : "verified"
        : "in_progress";

      await featureLoader.updateFeatureStatus(
        feature.id,
        newStatus,
        projectPath
      );

      // Delete context file if verified (only for non-skipTests)
      if (newStatus === "verified") {
        await contextManager.deleteContextFile(projectPath, feature.id);
      }

      sendToRenderer({
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: result.passes,
        message: result.message,
      });
    } catch (error) {
      console.error("[AutoMode] Error in follow-up:", error);
      sendToRenderer({
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Commit changes for a feature without doing additional work
   * This marks the feature as verified and commits the changes
   */
  async commitFeature({ projectPath, featureId, sendToRenderer }) {
    console.log(`[AutoMode] Committing feature: ${featureId}`);

    // Register briefly as running for the commit operation
    const execution = this.createExecutionContext(featureId);
    execution.projectPath = projectPath;
    execution.sendToRenderer = sendToRenderer;
    this.runningFeatures.set(featureId, execution);

    try {
      // Load feature to get description for commit message
      const features = await featureLoader.loadFeatures(projectPath);
      const feature = features.find((f) => f.id === featureId);

      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      sendToRenderer({
        type: "auto_mode_feature_start",
        featureId: feature.id,
        feature: { ...feature, description: "Committing changes..." },
      });

      sendToRenderer({
        type: "auto_mode_phase",
        featureId,
        phase: "action",
        message: "Committing changes to git...",
      });

      // Run git commit via the agent
      const commitResult = await featureExecutor.commitChangesOnly(
        feature,
        projectPath,
        sendToRenderer,
        execution
      );

      // Update status to verified
      await featureLoader.updateFeatureStatus(
        featureId,
        "verified",
        projectPath
      );

      // Delete context file
      await contextManager.deleteContextFile(projectPath, featureId);

      sendToRenderer({
        type: "auto_mode_feature_complete",
        featureId: feature.id,
        passes: true,
        message: "Changes committed successfully",
      });

      return { success: true };
    } catch (error) {
      console.error("[AutoMode] Error committing feature:", error);
      sendToRenderer({
        type: "auto_mode_error",
        error: error.message,
        featureId: featureId,
      });
      throw error;
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
module.exports = new AutoModeService();
