package com.agratec.fieldapp.data.local.dao

import androidx.room.*
import com.agratec.fieldapp.data.local.entity.FieldNoteEntity
import kotlinx.coroutines.flow.Flow

/**
 * DAO para notas de campo.
 * Métodos principales para el flujo offline-first:
 * - [getUnsyncedNotes]: obtiene batch de notas pendientes de sincronización
 * - [markAsSynced]: marca una nota como sincronizada exitosamente
 * - [getAllNotes]: Flow reactivo para la UI (lista de notas)
 */
@Dao
interface FieldNoteDao {

    /** Insertar una nueva nota (o reemplazar si el folio ya existe) */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(note: FieldNoteEntity): Long

    /** Insertar múltiples notas */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(notes: List<FieldNoteEntity>)

    /** Obtener notas NO sincronizadas (batch limitado para evitar payloads enormes) */
    @Query("SELECT * FROM field_notes WHERE isSynced = 0 ORDER BY id ASC LIMIT :limit")
    suspend fun getUnsyncedNotes(limit: Int = 10): List<FieldNoteEntity>

    /** Contar notas pendientes de sincronización */
    @Query("SELECT COUNT(*) FROM field_notes WHERE isSynced = 0")
    suspend fun getUnsyncedCount(): Int

    /** Marcar una nota como sincronizada */
    @Query("UPDATE field_notes SET isSynced = 1, syncAttempts = 0, lastSyncError = NULL WHERE folio = :folio")
    suspend fun markAsSynced(folio: String)

    /** Registrar un intento fallido de sincronización */
    @Query("UPDATE field_notes SET syncAttempts = syncAttempts + 1, lastSyncError = :error WHERE folio = :folio")
    suspend fun markSyncFailed(folio: String, error: String)

    /** Obtener todas las notas como Flow reactivo (para observar desde la UI) */
    @Query("SELECT * FROM field_notes ORDER BY id DESC")
    fun getAllNotes(): Flow<List<FieldNoteEntity>>

    /** Obtener una nota por folio */
    @Query("SELECT * FROM field_notes WHERE folio = :folio LIMIT 1")
    suspend fun getByFolio(folio: String): FieldNoteEntity?

    /** Eliminar una nota por ID */
    @Query("DELETE FROM field_notes WHERE id = :id")
    suspend fun deleteById(id: Long)

    /** Contar total de notas */
    @Query("SELECT COUNT(*) FROM field_notes")
    suspend fun getTotalCount(): Int
}
