package com.agratec.fieldapp.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.agratec.fieldapp.data.local.dao.ActivityPhotoDao
import com.agratec.fieldapp.data.local.dao.AppLogDao
import com.agratec.fieldapp.data.local.dao.CollaboratorDao
import com.agratec.fieldapp.data.local.dao.FieldActivityDao
import com.agratec.fieldapp.data.local.dao.FieldNoteDao
import com.agratec.fieldapp.data.local.dao.ParcelDao
import com.agratec.fieldapp.data.local.dao.PhotoDao
import com.agratec.fieldapp.data.local.dao.ProductDao
import com.agratec.fieldapp.data.local.entity.ActivityPhotoEntity
import com.agratec.fieldapp.data.local.entity.AppLogEntity
import com.agratec.fieldapp.data.local.entity.CollaboratorEntity
import com.agratec.fieldapp.data.local.entity.FieldActivityEntity
import com.agratec.fieldapp.data.local.entity.FieldNoteEntity
import com.agratec.fieldapp.data.local.entity.ParcelEntity
import com.agratec.fieldapp.data.local.entity.PhotoEntity
import com.agratec.fieldapp.data.local.entity.ProductEntity

/**
 * Base de datos Room local para la app de campo.
 * Almacena notas, fotos, parcelas y actividades de la libreta de campo
 * mientras el dispositivo está offline.
 *
 * Singleton: usar [getInstance] para obtener la instancia.
 *
 * v2 → v3: se agrega la tabla field_activities (libreta de campo).
 * v3 → v4: horas y jornadas multi-día en actividades, colaboradores de campo
 *          y fotos de actividades.
 * v4 → v5: almacén de productos (products_cache) y consumo de productos en
 *          actividades (planeado vs utilizado).
 * v5 → v6: seguimiento de notas de campo (estado, notas de resolución y
 *          vínculo con el servidor) para poder cerrarlas desde el teléfono.
 * v6 → v7: bitácora de la app (app_logs) y edición/foto de los productos
 *          del almacén desde el teléfono.
 * Las migraciones son REALES (no destructivas) para no perder datos pendientes
 * de sincronizar en los dispositivos de campo.
 */
@Database(
    entities = [FieldNoteEntity::class, PhotoEntity::class, ParcelEntity::class, FieldActivityEntity::class, CollaboratorEntity::class, ActivityPhotoEntity::class, ProductEntity::class, AppLogEntity::class],
    version = 7,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun fieldNoteDao(): FieldNoteDao
    abstract fun photoDao(): PhotoDao
    abstract fun parcelDao(): ParcelDao
    abstract fun fieldActivityDao(): FieldActivityDao
    abstract fun collaboratorDao(): CollaboratorDao
    abstract fun activityPhotoDao(): ActivityPhotoDao
    abstract fun productDao(): ProductDao
    abstract fun appLogDao(): AppLogDao

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

        /** v3 → v4: horas/jornadas en actividades + colaboradores + fotos de actividad */
        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `field_activities` ADD COLUMN `startTime` TEXT")
                db.execSQL("ALTER TABLE `field_activities` ADD COLUMN `endTime` TEXT")
                db.execSQL("ALTER TABLE `field_activities` ADD COLUMN `workSessionsJson` TEXT NOT NULL DEFAULT '[]'")
                db.execSQL("ALTER TABLE `field_activities` ADD COLUMN `collaboratorUuidsCsv` TEXT NOT NULL DEFAULT ''")
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `collaborators_cache` (
                        `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        `clientUuid` TEXT NOT NULL,
                        `serverId` INTEGER,
                        `name` TEXT NOT NULL,
                        `role` TEXT,
                        `phone` TEXT,
                        `isSynced` INTEGER NOT NULL,
                        `syncAttempts` INTEGER NOT NULL,
                        `lastSyncError` TEXT
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_collaborators_cache_clientUuid` ON `collaborators_cache` (`clientUuid`)")
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `activity_photos` (
                        `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        `localPhotoId` TEXT NOT NULL,
                        `activityClientUuid` TEXT NOT NULL,
                        `localFilePath` TEXT NOT NULL,
                        `photoType` TEXT NOT NULL,
                        `isSynced` INTEGER NOT NULL,
                        `syncAttempts` INTEGER NOT NULL,
                        `lastSyncError` TEXT,
                        `createdAtLocal` TEXT NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_activity_photos_localPhotoId` ON `activity_photos` (`localPhotoId`)")
            }
        }

        /** v4 → v5: almacén de productos + productos consumidos en cada actividad */
        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `field_activities` ADD COLUMN `productsJson` TEXT NOT NULL DEFAULT '[]'")
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `products_cache` (
                        `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        `clientUuid` TEXT NOT NULL,
                        `serverId` INTEGER,
                        `name` TEXT NOT NULL,
                        `brand` TEXT,
                        `category` TEXT NOT NULL DEFAULT 'otro',
                        `unit` TEXT NOT NULL DEFAULT 'kg',
                        `isSynced` INTEGER NOT NULL,
                        `syncAttempts` INTEGER NOT NULL,
                        `lastSyncError` TEXT
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_products_cache_clientUuid` ON `products_cache` (`clientUuid`)")
            }
        }

        /** v5 → v6: estado y seguimiento de las notas de campo */
        private val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `field_notes` ADD COLUMN `serverId` INTEGER")
                db.execSQL("ALTER TABLE `field_notes` ADD COLUMN `status` TEXT NOT NULL DEFAULT 'abierta'")
                db.execSQL("ALTER TABLE `field_notes` ADD COLUMN `resolutionNotes` TEXT")
                db.execSQL("ALTER TABLE `field_notes` ADD COLUMN `statusDirty` INTEGER NOT NULL DEFAULT 0")
            }
        }

        /** v6 → v7: bitácora de la app y edición/foto de productos */
        private val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `app_logs` (
                        `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        `clientLogId` TEXT NOT NULL,
                        `action` TEXT NOT NULL,
                        `screen` TEXT,
                        `detail` TEXT,
                        `originalBytes` INTEGER,
                        `finalBytes` INTEGER,
                        `durationSeconds` INTEGER,
                        `occurredAt` TEXT NOT NULL,
                        `isSynced` INTEGER NOT NULL,
                        `syncAttempts` INTEGER NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_app_logs_clientLogId` ON `app_logs` (`clientLogId`)")

                // Edición y foto de productos desde el teléfono
                db.execSQL("ALTER TABLE `products_cache` ADD COLUMN `description` TEXT")
                db.execSQL("ALTER TABLE `products_cache` ADD COLUMN `activeIngredient` TEXT")
                db.execSQL("ALTER TABLE `products_cache` ADD COLUMN `concentration` TEXT")
                db.execSQL("ALTER TABLE `products_cache` ADD COLUMN `presentation` TEXT")
                db.execSQL("ALTER TABLE `products_cache` ADD COLUMN `storageLocation` TEXT")
                db.execSQL("ALTER TABLE `products_cache` ADD COLUMN `photoUrl` TEXT")
                db.execSQL("ALTER TABLE `products_cache` ADD COLUMN `localPhotoPath` TEXT")
                db.execSQL("ALTER TABLE `products_cache` ADD COLUMN `photoDirty` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE `products_cache` ADD COLUMN `isDirty` INTEGER NOT NULL DEFAULT 0")
            }
        }

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "agra_field_notes.db"
                )
                    .addMigrations(MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7)
                    // Solo como último recurso para saltos sin ruta de migración
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
