package com.agratec.fieldapp.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Colaboradores de campo (cache local + altas offline).
 *
 * Los colaboradores del servidor llegan por el pull de sincronización con
 * [serverId]; los dados de alta desde el teléfono nacen con isSynced = false
 * y se suben con clientUuid como clave de idempotencia.
 */
@Entity(
    tableName = "collaborators_cache",
    indices = [Index(value = ["clientUuid"], unique = true)]
)
data class CollaboratorEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    /** UUID local — clave de idempotencia con el servidor */
    val clientUuid: String,

    /** ID en el servidor (null hasta sincronizar) */
    val serverId: Int? = null,

    val name: String,

    /** Ej: "Encargado de riego", "Jornalero" */
    val role: String? = null,

    val phone: String? = null,

    val isSynced: Boolean = false,

    val syncAttempts: Int = 0,

    val lastSyncError: String? = null,
)
