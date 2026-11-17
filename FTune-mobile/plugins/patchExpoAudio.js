const fs = require("fs");
const path = require("path");

function replaceExact(filePath, target, replacement, checkAlreadyApplied) {
  let content = fs.readFileSync(filePath, "utf8");
  const usesCrlf = content.includes("\r\n");
  const normalized = usesCrlf ? content.replace(/\r\n/g, "\n") : content;
  const normTarget = target.replace(/\r\n/g, "\n");
  const normReplacement = replacement.replace(/\r\n/g, "\n");

  if (checkAlreadyApplied && normalized.includes(checkAlreadyApplied.replace(/\r\n/g, "\n"))) {
    return false;
  }
  if (!normalized.includes(normTarget)) {
    throw new Error(`[patchExpoAudio] Expected target block not found in ${filePath}`);
  }
  const updated = normalized.replace(normTarget, normReplacement);
  fs.writeFileSync(filePath, usesCrlf ? updated.replace(/\n/g, "\r\n") : updated, "utf8");
  return true;
}

function patchExpoAudio(projectRoot = path.resolve(__dirname, "..")) {
  const pkgDir = path.join(projectRoot, "node_modules", "expo-audio");
  if (!fs.existsSync(pkgDir)) {
    console.warn("[patchExpoAudio] expo-audio not found at", pkgDir);
    return;
  }

  const androidJavaDir = path.join(pkgDir, "android", "src", "main", "java", "expo", "modules", "audio");

  // 1. AudioRecords.kt: add durationSeconds field to Metadata
  replaceExact(
    path.join(androidJavaDir, "AudioRecords.kt"),
    `@OptimizedRecord
class Metadata(
  @Field val title: String?,
  @Field val artist: String?,
  @Field val albumTitle: String?,
  @Field val artworkUrl: URL?
) : Record`,
    `@OptimizedRecord
class Metadata(
  @Field val title: String?,
  @Field val artist: String?,
  @Field val albumTitle: String?,
  @Field val artworkUrl: URL?,
  @Field val durationSeconds: Double? = null
) : Record`,
    `@Field val durationSeconds: Double? = null`
  );

  // 2. MetadataInjectingPlayer.kt: expose durationMs and real/hint duration, plus notifyMetadataChanged()
  replaceExact(
    path.join(androidJavaDir, "service", "MetadataInjectingPlayer.kt"),
    `import androidx.core.net.toUri
import androidx.media3.common.FlagSet`,
    `import androidx.core.net.toUri
import androidx.media3.common.C
import androidx.media3.common.FlagSet`,
    `import androidx.media3.common.C`
  );

  replaceExact(
    path.join(androidJavaDir, "service", "MetadataInjectingPlayer.kt"),
    `  override fun getMediaMetadata(): MediaMetadata {
    val metadata = injectedMetadata
    return super.getMediaMetadata()
      .buildUpon()
      .setTitle(metadata?.title)
      .setArtist(metadata?.artist)
      .setAlbumTitle(metadata?.albumTitle)
      .setArtworkUri(metadata?.artworkUrl?.toString()?.toUri())
      .setArtworkData(null, null)
      .build()
  }`,
    `  private fun resolvedDurationMs(): Long {
    val realDuration = super.getDuration()
    if (realDuration != C.TIME_UNSET && realDuration > 0L) {
      return realDuration
    }
    val hintSec = injectedMetadata?.durationSeconds
    if (hintSec != null && hintSec.isFinite() && hintSec > 0.0) {
      return (hintSec * 1000.0).toLong()
    }
    return C.TIME_UNSET
  }

  override fun getDuration(): Long = resolvedDurationMs()

  override fun getMediaMetadata(): MediaMetadata {
    val metadata = injectedMetadata
    val builder = super.getMediaMetadata()
      .buildUpon()
      .setTitle(metadata?.title)
      .setArtist(metadata?.artist)
      .setAlbumTitle(metadata?.albumTitle)
      .setArtworkUri(metadata?.artworkUrl?.toString()?.toUri())
      .setArtworkData(null, null)
    val durMs = resolvedDurationMs()
    if (durMs != C.TIME_UNSET && durMs > 0L) {
      builder.setDurationMs(durMs)
    }
    return builder.build()
  }

  fun notifyMetadataChanged() {
    if (Looper.myLooper() != applicationLooper) {
      handler.post { notifyMetadataChanged() }
      return
    }
    val newMetadata = mediaMetadata
    val events = Player.Events(
      FlagSet.Builder()
        .add(Player.EVENT_MEDIA_METADATA_CHANGED)
        .add(Player.EVENT_TIMELINE_CHANGED)
        .build()
    )
    val currentListeners = synchronized(listeners) {
      listeners.keys.toList()
    }
    currentListeners.forEach {
      it.onMediaMetadataChanged(newMetadata)
    }
    currentListeners.forEach {
      it.onEvents(this, events)
    }
  }`,
    `fun notifyMetadataChanged()`
  );

  // 3. AudioPlayer.kt: music AudioAttributes + lockScreenNext / lockScreenPrevious support
  replaceExact(
    path.join(androidJavaDir, "AudioPlayer.kt"),
    `    .setLooper(context.mainLooper)
    .setAudioAttributes(AudioAttributes.DEFAULT, false)`,
    `    .setLooper(context.mainLooper)
    .setAudioAttributes(
      AudioAttributes.Builder()
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
        .setUsage(C.USAGE_MEDIA)
        .build(),
      false
    )`,
    `.setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)`
  );

  replaceExact(
    path.join(androidJavaDir, "AudioPlayer.kt"),
    `  override val isLive: Boolean
    get() = ref.isCurrentMediaItemLive`,
    `  override val isLive: Boolean
    get() = ref.isCurrentMediaItemLive

  override val supportsNextTrack: Boolean
    get() = lockScreenOptions?.showNextTrack == true

  override val supportsPreviousTrack: Boolean
    get() = lockScreenOptions?.showPreviousTrack == true

  override fun nextTrack() {
    emit("lockScreenNext")
  }

  override fun previousTrack() {
    emit("lockScreenPrevious")
  }`,
    `emit("lockScreenNext")`
  );

  // 4. AudioModule.kt: seek to 0 when resuming a finished track from notification/JS
  replaceExact(
    path.join(androidJavaDir, "AudioModule.kt"),
    `    if (focusResult == AudioFocusResult.DELAYED) {
      // The AUDIOFOCUS_GAIN branch starts it once the system grants focus.
      playable.isPaused = true
      return
    }
    playable.play()`,
    `    if (focusResult == AudioFocusResult.DELAYED) {
      // The AUDIOFOCUS_GAIN branch starts it once the system grants focus.
      playable.isPaused = true
      return
    }
    if (playable.player.playbackState == Player.STATE_ENDED) {
      playable.player.seekTo(0)
    }
    playable.play()`,
    `playable.player.playbackState == Player.STATE_ENDED`
  );

  // 5. AudioControlsService.kt: timeline updates, standard prev/next transport, session cleanup
  const controlsPath = path.join(androidJavaDir, "service", "AudioControlsService.kt");

  replaceExact(
    controlsPath,
    `import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player`,
    `import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import androidx.media3.common.Timeline`,
    `import androidx.media3.common.Timeline`
  );

  replaceExact(
    controlsPath,
    `    // Older Android system UI expects explicit notification actions for transport controls.
    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2) {`,
    `    // Always populate explicit notification actions and compact indices for broad OEM compatibility.
    run {`,
    `// Always populate explicit notification actions and compact indices for broad OEM compatibility.`
  );

  replaceExact(
    controlsPath,
    `  private fun updateSessionCustomLayout(isPlaying: Boolean) {
    val session = mediaSession ?: return
    val mediaButtons = mutableListOf<CommandButton>()

    val playable = currentPlayable`,
    `  private fun updateSessionCustomLayout(isPlaying: Boolean) {
    val session = mediaSession ?: return
    val playable = currentPlayable
    val useNext = currentOptions?.showNextTrack == true && playable?.supportsNextTrack == true
    val usePrev = currentOptions?.showPreviousTrack == true && playable?.supportsPreviousTrack == true
    val useSeekBack = !usePrev && currentOptions?.showSeekBackward == true
    val useSeekFwd = !useNext && currentOptions?.showSeekForward == true

    // Preserve MediaSessionLegacyStub standard ACTION_SKIP_TO_PREVIOUS / ACTION_SKIP_TO_NEXT
    // when standard track-skipping is used without custom seek buttons.
    if (!useSeekBack && !useSeekFwd) {
      session.setCustomLayout(emptyList())
      session.setMediaButtonPreferences(emptyList())
      return
    }

    val mediaButtons = mutableListOf<CommandButton>()`,
    `Preserve MediaSessionLegacyStub standard ACTION_SKIP_TO_PREVIOUS`
  );

  replaceExact(
    controlsPath,
    `  private fun resolveSessionPlayer(playable: LockScreenPlayable, options: AudioLockScreenOptions?): Player {
    val player = PlayRequestingPlayer(playable.player) { playable.requestPlay() }
    val isLive = options?.isLiveStream ?: playable.isLive
    val forwardMs = seekIntervalMs(options?.seekForwardIntervalSeconds)
    val backwardMs = seekIntervalMs(options?.seekBackwardIntervalSeconds)

    return object : ForwardingPlayer(player) {
      override fun getSeekForwardIncrement(): Long = forwardMs

      override fun getSeekBackIncrement(): Long = backwardMs

      override fun seekForward() {
        seekTo(currentPosition + forwardMs)
      }

      override fun seekBack() {
        seekTo((currentPosition - backwardMs).coerceAtLeast(0))
      }

      override fun getAvailableCommands(): Player.Commands {
        val commands = super.getAvailableCommands().buildUpon()
        if (isLive) {
          commands.remove(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
        }
        return commands.build()
      }
    }
  }`,
    `  private fun resolveSessionPlayer(playable: LockScreenPlayable, options: AudioLockScreenOptions?): Player {
    val player = PlayRequestingPlayer(playable.player) { playable.requestPlay() }
    val forwardMs = seekIntervalMs(options?.seekForwardIntervalSeconds)
    val backwardMs = seekIntervalMs(options?.seekBackwardIntervalSeconds)

    return object : ForwardingPlayer(player) {
      override fun getSeekForwardIncrement(): Long = forwardMs

      override fun getSeekBackIncrement(): Long = backwardMs

      override fun seekForward() {
        seekTo(currentPosition + forwardMs)
      }

      override fun seekBack() {
        seekTo((currentPosition - backwardMs).coerceAtLeast(0))
      }

      override fun hasNextMediaItem(): Boolean {
        return (options?.showNextTrack == true && playable.supportsNextTrack) || super.hasNextMediaItem()
      }

      override fun hasPreviousMediaItem(): Boolean {
        return (options?.showPreviousTrack == true && playable.supportsPreviousTrack) || super.hasPreviousMediaItem()
      }

      override fun seekToNext() {
        if (options?.showNextTrack == true && playable.supportsNextTrack) {
          playable.nextTrack()
        } else {
          super.seekToNext()
        }
      }

      override fun seekToNextMediaItem() {
        if (options?.showNextTrack == true && playable.supportsNextTrack) {
          playable.nextTrack()
        } else {
          super.seekToNextMediaItem()
        }
      }

      override fun seekToPrevious() {
        if (options?.showPreviousTrack == true && playable.supportsPreviousTrack) {
          playable.previousTrack()
        } else {
          super.seekToPrevious()
        }
      }

      override fun seekToPreviousMediaItem() {
        if (options?.showPreviousTrack == true && playable.supportsPreviousTrack) {
          playable.previousTrack()
        } else {
          super.seekToPreviousMediaItem()
        }
      }

      override fun getAvailableCommands(): Player.Commands {
        val isLive = options?.isLiveStream ?: playable.isLive
        val commands = super.getAvailableCommands().buildUpon()
          .add(Player.COMMAND_PLAY_PAUSE)
          .add(Player.COMMAND_GET_CURRENT_MEDIA_ITEM)
          .add(Player.COMMAND_GET_METADATA)
          .add(Player.COMMAND_GET_TIMELINE)
        if (isLive) {
          commands.remove(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
        } else {
          commands.add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
        }
        if (options?.showPreviousTrack == true && playable.supportsPreviousTrack) {
          commands.add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
          commands.add(Player.COMMAND_SEEK_TO_PREVIOUS)
        }
        if (options?.showNextTrack == true && playable.supportsNextTrack) {
          commands.add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
          commands.add(Player.COMMAND_SEEK_TO_NEXT)
        }
        return commands.build()
      }
    }
  }`,
    `override fun seekToNextMediaItem()`
  );

  replaceExact(
    controlsPath,
    `    if (playable != null) {
      mediaSession?.release()
      sessionMetadataPlayer = null

      appContext?.mainQueue?.launch {
        val context = appContext?.reactContext ?: return@launch
        val sessionPlayer = MetadataInjectingPlayer(resolveSessionPlayer(playable, options)).apply {
          updateMetadata(metadata)
        }
        // Distinguish this lock-screen session from the basic session built in
        // \`buildBasicMediaSession\` (and from sessions for other players); two
        // MediaSession instances with the empty default ID throw on construction.
        val session = MediaSession.Builder(context, sessionPlayer)
          .setId("ExpoAudioLockScreenSession_\${playable.player.hashCode()}")
          .setCallback(AudioMediaSessionCallback(this@AudioControlsService))
          .build()`,
    `    if (playable != null) {
      mediaSession?.let {
        removeSession(it)
        it.release()
      }
      mediaSession = null
      sessionMetadataPlayer = null

      appContext?.mainQueue?.launch {
        val context = appContext?.reactContext ?: return@launch
        val sessionPlayer = MetadataInjectingPlayer(resolveSessionPlayer(playable, options)).apply {
          updateMetadata(metadata)
        }
        val sessionBuilder = MediaSession.Builder(context, sessionPlayer)
          .setId("ExpoAudioLockScreenSession_\${playable.player.hashCode()}")
          .setCallback(AudioMediaSessionCallback(this@AudioControlsService))
        buildContentIntent()?.let { sessionBuilder.setSessionActivity(it) }
        val session = sessionBuilder.build()`,
    `buildContentIntent()?.let { sessionBuilder.setSessionActivity(it) }`
  );

  replaceExact(
    controlsPath,
    `  private fun updateMetadataInternal(playable: LockScreenPlayable, metadata: Metadata?) {
    if (playable != currentPlayable || metadata == currentMetadata) {
      return
    }
    currentMetadata = metadata
    sessionMetadataPlayer?.updateMetadata(metadata)
    updateArtwork(metadata)
  }

  private fun clearSessionInternal() {
    val playable = currentPlayable
    playable?.isActiveForLockScreen = false
    removePlayerListener()
    currentMetadata = null
    mediaSession?.release()
    mediaSession = null`,
    `  private fun updateMetadataInternal(playable: LockScreenPlayable, metadata: Metadata?) {
    if (playable != currentPlayable || metadata == currentMetadata) {
      return
    }
    currentMetadata = metadata
    sessionMetadataPlayer?.updateMetadata(metadata)
    updateArtwork(metadata)
    postOrStartForegroundNotification(startInForeground = false)
  }

  private fun clearSessionInternal() {
    val playable = currentPlayable
    playable?.isActiveForLockScreen = false
    removePlayerListener()
    currentMetadata = null
    mediaSession?.let {
      removeSession(it)
      it.release()
    }
    mediaSession = null`,
    `sessionMetadataPlayer?.updateMetadata(metadata)\n    updateArtwork(metadata)\n    postOrStartForegroundNotification(startInForeground = false)`
  );

  replaceExact(
    controlsPath,
    `      mediaSession?.release()
      sessionMetadataPlayer = null
      appContext?.mainQueue?.launch {
        val context = appContext?.reactContext ?: return@launch
        val sessionPlayer = MetadataInjectingPlayer(resolveSessionPlayer(playable, options)).apply {
          updateMetadata(metadata)
        }
        val session = MediaSession.Builder(context, sessionPlayer)
          .setId("ExpoAudioLockScreenSession_\${playable.player.hashCode()}")
          .setCallback(AudioMediaSessionCallback(this@AudioControlsService))
          .build()`,
    `      mediaSession?.let {
        removeSession(it)
        it.release()
      }
      mediaSession = null
      sessionMetadataPlayer = null
      appContext?.mainQueue?.launch {
        val context = appContext?.reactContext ?: return@launch
        val sessionPlayer = MetadataInjectingPlayer(resolveSessionPlayer(playable, options)).apply {
          updateMetadata(metadata)
        }
        val sessionBuilder = MediaSession.Builder(context, sessionPlayer)
          .setId("ExpoAudioLockScreenSession_\${playable.player.hashCode()}")
          .setCallback(AudioMediaSessionCallback(this@AudioControlsService))
        buildContentIntent()?.let { sessionBuilder.setSessionActivity(it) }
        val session = sessionBuilder.build()`,
    `      mediaSession?.let {\n        removeSession(it)\n        it.release()\n      }\n      mediaSession = null\n      sessionMetadataPlayer = null\n      appContext?.mainQueue?.launch`
  );

  replaceExact(
    controlsPath,
    `  private fun addPlayerListener(playable: LockScreenPlayable) {
    val listener = object : Player.Listener {
      override fun onIsPlayingChanged(isPlaying: Boolean) {
        updateSessionCustomLayout(isPlaying)
        postOrStartForegroundNotification(startInForeground = false)
      }

      override fun onPlaybackStateChanged(playbackState: Int) {
        postOrStartForegroundNotification(startInForeground = false)
      }
    }
    playbackListener = listener
    playable.player.addListener(listener)
  }`,
    `  private fun addPlayerListener(playable: LockScreenPlayable) {
    val listener = object : Player.Listener {
      override fun onIsPlayingChanged(isPlaying: Boolean) {
        updateSessionCustomLayout(isPlaying)
        postOrStartForegroundNotification(startInForeground = false)
      }

      override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_READY) {
          sessionMetadataPlayer?.notifyMetadataChanged()
        }
        updateSessionCustomLayout(playable.player.isPlaying)
        postOrStartForegroundNotification(startInForeground = false)
      }

      override fun onTimelineChanged(timeline: Timeline, reason: Int) {
        sessionMetadataPlayer?.notifyMetadataChanged()
        postOrStartForegroundNotification(startInForeground = false)
      }

      override fun onPositionDiscontinuity(
        oldPosition: Player.PositionInfo,
        newPosition: Player.PositionInfo,
        reason: Int
      ) {
        if (reason == Player.DISCONTINUITY_REASON_SEEK) {
          postOrStartForegroundNotification(startInForeground = false)
        }
      }
    }
    playbackListener = listener
    playable.player.addListener(listener)
  }`,
    `override fun onTimelineChanged(timeline: Timeline, reason: Int)`
  );

  // 6. TypeScript definitions for durationSeconds & lockScreenNext/lockScreenPrevious
  replaceExact(
    path.join(pkgDir, "src", "Audio.types.ts"),
    `export type AudioMetadata = {
  title?: string;
  artist?: string;
  albumTitle?: string;
  artworkUrl?: string;
};`,
    `export type AudioMetadata = {
  title?: string;
  artist?: string;
  albumTitle?: string;
  artworkUrl?: string;
  durationSeconds?: number;
};`,
    `durationSeconds?: number;`
  );

  replaceExact(
    path.join(pkgDir, "build", "Audio.types.d.ts"),
    `export type AudioMetadata = {
    title?: string;
    artist?: string;
    albumTitle?: string;
    artworkUrl?: string;
};`,
    `export type AudioMetadata = {
    title?: string;
    artist?: string;
    albumTitle?: string;
    artworkUrl?: string;
    durationSeconds?: number;
};`,
    `durationSeconds?: number;`
  );

  replaceExact(
    path.join(pkgDir, "src", "AudioModule.types.ts"),
    `export type AudioEvents = {
  /** Fired when the player's status changes (play/pause/seek/load and so on.). */
  playbackStatusUpdate(status: AudioStatus): void;
  /** Fired when audio sampling is enabled and new sample data is available. */
  audioSampleUpdate(data: AudioSample): void;
};`,
    `export type AudioEvents = {
  /** Fired when the player's status changes (play/pause/seek/load and so on.). */
  playbackStatusUpdate(status: AudioStatus): void;
  /** Fired when audio sampling is enabled and new sample data is available. */
  audioSampleUpdate(data: AudioSample): void;
  /** Fired when the lock screen / notification next track control is pressed. */
  lockScreenNext(): void;
  /** Fired when the lock screen / notification previous track control is pressed. */
  lockScreenPrevious(): void;
};`,
    `lockScreenNext(): void;`
  );

  replaceExact(
    path.join(pkgDir, "build", "AudioModule.types.d.ts"),
    `export type AudioEvents = {
    /** Fired when the player's status changes (play/pause/seek/load and so on.). */
    playbackStatusUpdate(status: AudioStatus): void;
    /** Fired when audio sampling is enabled and new sample data is available. */
    audioSampleUpdate(data: AudioSample): void;
};`,
    `export type AudioEvents = {
    /** Fired when the player's status changes (play/pause/seek/load and so on.). */
    playbackStatusUpdate(status: AudioStatus): void;
    /** Fired when audio sampling is enabled and new sample data is available. */
    audioSampleUpdate(data: AudioSample): void;
    /** Fired when the lock screen / notification next track control is pressed. */
    lockScreenNext(): void;
    /** Fired when the lock screen / notification previous track control is pressed. */
    lockScreenPrevious(): void;
};`,
    `lockScreenNext(): void;`
  );

  console.log("[patchExpoAudio] Verified expo-audio Android & TypeScript patches.");
}

if (require.main === module) {
  patchExpoAudio();
}

module.exports = patchExpoAudio;
