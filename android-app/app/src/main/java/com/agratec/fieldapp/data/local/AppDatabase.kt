package com.agratec.fieldapp.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.agratec.fieldapp.data.local.dao.FieldActivityDao
import com.agratec.fieldapp.data.local.dao.FieldNoteDao
import com.agratec.fieldapp.data.local.dao.ParcelDao
import com.agratec.fieldapp.data.local.dao.PhotoDao
import com.agratec.fieldapp.data.local.entity.FieldActivityEntity
import com.agratec.fieldapp.data.local.entity.FieldNoteEntity
import com.agratec.fieldapp.data.local.entity.ParcelEntity
import com.agratec.fieldapp.data.local.entity.PhotoEntity

/**
 * Base de datos Room local para la app de campo.
 * Almacena notas, fotos, parcelas y actividades de la libreta de campo
 * mientras el dispositivo está offline.
 *
 * Singleton: usar [getInstance] para obtener la instancia.
 *
 * v2 → v3: se agrega la tabla field_activities (libreta de campo).
 * La migración es REAL (no destructiva) para no perder notas pendientes
 * de sincronizar en los dispositivos de campo.
 */
@Database(
    entities = [FieldNoteEntity::class, PhotoEntity::class, ParcelEntity::class, FieldActivityEntity::class],
    version = 3,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun fieldNoteDao(): FieldNoteDao
    abstract fun photoDao(): PhotoDao
    abstract fun parcelDao(): ParcelDao
    abstract fun fieldActivityDao(): FieldActivityDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        /** v2 → v3: tabla nueva de actividades de la libreta de campo */
        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `field_activities` (
                        `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        `clientUuid` TEXT NOT NULL,
                        `serverId` INTEGER,
                        `activityType` TEXT NOT NULL,
                        `activitySubtype` TEXT,
                        `description` TEXT NOT NULL,
                        `performedBy` TEXT NOT NULL,
                        `activityDate` TEXT NOT NULL,
                        `status` TEXT NOT NULL,
                        `parcelIdsCsv` TEXT NOT NULL,
                        `isSynced` INTEGER NOT NULL,
                        `syncAttempts` INTEGER NOT NULL,
                        `lastSyncError` TEXT,
                        `createdAtLocal` TEXT NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    "CREATE UNIQUE INDEX IF NOT EXISTS `index_field_activities_clientUuid` ON `field_activities` (`clientUuid`)"
                )
            }
        }

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "agra_field_notes.db"
                )
                    .addMigrations(MIGRATION_2_3)
                    // Solo como último recurso para saltos sin ruta de migración
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
