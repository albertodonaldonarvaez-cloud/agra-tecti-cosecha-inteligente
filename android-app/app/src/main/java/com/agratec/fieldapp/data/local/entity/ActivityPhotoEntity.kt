package com.agratec.fieldapp.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Fotos de actividades de la libreta de campo tomadas desde la app.
 * Se pueden tomar varias por actividad (varios ángulos de la parcela).
 * Se suben con multipart a /api/sync/activity-photo cuando la actividad
 * ya está sincronizada en el servidor.
 */
@Entity(
    tableName = "activity_photos",
    indices = [Index(value = ["localPhotoId"], unique = true)]
)
data class ActivityPhotoEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    /** ID local único de la foto (idempotencia del upload) */
    val localPhotoId: String,

    /** clientUuid de la actividad a la que pertenece */
    val activityClientUuid: String,

    /** Ruta absoluta del archivo en el dispositivo */
    val localFilePath: String,

    /** antes | despues | durante | producto | otro */
    val photoType: String = "durante",

    val isSynced: Boolean = false,

    val syncAttempts: Int = 0,

    val lastSyncError: String? = null,

    /** Timestamp local ISO 8601 */
    val createdAtLocal: String,
)
