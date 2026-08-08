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

    @Update
    suspend fun update(note: FieldNoteEntity)

    /** Eliminar una nota por ID */
    @Query("DELETE FROM field_notes WHERE id = :id")
    suspend fun deleteById(id: Long)

    // ── Seguimiento de estado (cerrar notas desde el campo) ──

    /** Cambiar el estado localmente y marcarlo pendiente de subir */
    @Query("UPDATE field_notes SET status = :status, resolutionNotes = :resolutionNotes, statusDirty = 1 WHERE folio = :folio")
    suspend fun setStatusLocally(folio: String, status: String, resolutionNotes: String?)

    /** Notas con cambio de estado pendiente de subir (solo las que ya existen en el servidor) */
    @Query("SELECT * FROM field_notes WHERE statusDirty = 1 AND isSynced = 1 ORDER BY id ASC LIMIT :limit")
    suspend fun getStatusDirty(limit: Int = 20): List<FieldNoteEntity>

    @Query("SELECT COUNT(*) FROM field_notes WHERE statusDirty = 1")
    suspend fun getStatusDirtyCount(): Int

    @Query("UPDATE field_notes SET statusDirty = 0 WHERE folio = :folio")
    suspend fun clearStatusDirty(folio: String)

    // ── Reconciliación con el servidor ──

    /**
     * Folios ya sincronizados y sin cambios locales pendientes.
     * Se comparan en memoria contra los folios vivos del servidor: así el
     * borrado no depende de un NOT IN gigante (SQLite limita los parámetros
     * de una consulta y con muchas notas fallaría).
     */
    @Query("SELECT folio FROM field_notes WHERE isSynced = 1 AND statusDirty = 0")
    suspend fun getReconcilableFolios(): List<String>

    /** Borrar por folio, en lotes pequeños */
    @Query("DELETE FROM field_notes WHERE folio IN (:folios)")
    suspend fun deleteByFolios(folios: List<String>)

    /** El servidor se quedó sin notas: se vacía lo ya sincronizado */
    @Query("DELETE FROM field_notes WHERE isSynced = 1 AND statusDirty = 0")
    suspend fun deleteAllSynced()

    /** Borrar una nota por folio (el servidor la eliminó) */
    @Query("DELETE FROM field_notes WHERE folio = :folio")
    suspend fun deleteByFolio(folio: String)

    /** Contar total de notas */
    @Query("SELECT COUNT(*) FROM field_notes")
    suspend fun getTotalCount(): Int
}
