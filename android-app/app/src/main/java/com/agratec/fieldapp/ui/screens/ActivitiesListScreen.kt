package com.agratec.fieldapp.ui.screens

import android.Manifest
import android.net.Uri
import android.os.Environment
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.agratec.fieldapp.data.local.entity.ActivityProduct
import com.agratec.fieldapp.data.local.entity.FieldActivityEntity
import com.agratec.fieldapp.data.repository.FieldActivityRepository
import com.agratec.fieldapp.data.repository.ProductRepository
import com.agratec.fieldapp.sync.SyncStatus
import com.agratec.fieldapp.ui.components.*
import com.agratec.fieldapp.ui.theme.*
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ===== Catálogo de la libreta de campo (mismos valores que la web) =====

data class ActivityTypeUi(val value: String, val label: String, val emoji: String, val color: Color)

val ACTIVITY_TYPES_UI = listOf(
    ActivityTypeUi("riego", "Riego", "💧", CatRiego),
    ActivityTypeUi("fertilizacion", "Fertilización", "🧪", CatFertilizacion),
    ActivityTypeUi("nutricion", "Nutrición", "🍃", AgraGreen),
    ActivityTypeUi("poda", "Poda", "✂️", Color(0xFF9333EA)),
    ActivityTypeUi("control_maleza", "Control Maleza", "🌿", CatMaleza),
    ActivityTypeUi("control_plagas", "Control Plagas", "🐛", CatPlaga),
    ActivityTypeUi("aplicacion_fitosanitaria", "Fitosanitaria", "🛡️", Color(0xFF0D9488)),
    ActivityTypeUi("otro", "Otro", "📝", CatOtro),
)

val ACTIVITY_SUBTYPES_UI: Map<String, List<String>> = mapOf(
    "riego" to listOf("Goteo", "Aspersión", "Gravedad", "Microaspersión", "Inundación", "Fertirriego"),
    "fertilizacion" to listOf("Granular al suelo", "Líquida", "Foliar", "Orgánica", "Fertirriego", "Enmienda", "Cal agrícola", "Yeso agrícola"),
    "nutricion" to listOf("Foliar", "Radicular", "Bioestimulante", "Ácidos húmicos", "Aminoácidos", "Microelementos"),
    "poda" to listOf("Formación", "Producción", "Sanitaria", "Rejuvenecimiento", "Despunte", "Aclareo", "Deshoje"),
    "control_maleza" to listOf("Herbicida preemergente", "Herbicida postemergente", "Herbicida selectivo", "Herbicida no selectivo", "Mecánico (desbrozadora)", "Mecánico (machete)", "Mecánico (azadón)", "Manual", "Cobertura vegetal"),
    "control_plagas" to listOf("Insecticida", "Fungicida", "Acaricida", "Nematicida", "Biológico", "Trampas", "Monitoreo"),
    "aplicacion_fitosanitaria" to listOf("Preventiva", "Curativa", "Erradicante", "Protectante"),
)

fun activityTypeUi(value: String): ActivityTypeUi =
    ACTIVITY_TYPES_UI.find { it.value == value } ?: ACTIVITY_TYPES_UI.last()

fun statusLabelUi(status: String): Pair<String, Color> = when (status) {
    "planificada" -> "Planificada" to StatusInProgress
    "en_progreso" -> "En progreso" to SyncPending
    "completada" -> "Completada" to StatusResolved
    "cancelada" -> "Cancelada" to StatusCritical
    else -> status to TextTertiary
}

/**
 * Libreta de Campo: actividades planificadas desde la web o creadas en el campo,
 * con filtro por estado, evidencia fotográfica y registro de lo consumido.
 */
@Composable
fun ActivitiesListScreen(
    onSync: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { FieldActivityRepository(context) }
    val activities by repository.getAll().collectAsState(initial = emptyList())

    var filter by rememberSaveable { mutableStateOf("pendientes") } // pendientes | realizadas | todas
    var unsyncedCount by remember { mutableIntStateOf(0) }
    var confirmActivity by remember { mutableStateOf<FieldActivityEntity?>(null) }
    var consumptionActivity by remember { mutableStateOf<FieldActivityEntity?>(null) }

    val syncStatus by SyncStatus.state.collectAsState()

    LaunchedEffect(activities) {
        unsyncedCount = repository.getUnsyncedCount()
    }

    // Al abrir: bajar del servidor lo que haya cambiado
    LaunchedEffect(Unit) {
        repository.pullFromServer()
    }

    val filtered = when (filter) {
        "pendientes" -> activities.filter { it.status == "planificada" || it.status == "en_progreso" }
        "realizadas" -> activities.filter { it.status == "completada" }
        else -> activities
    }
    val pendingCount = activities.count { it.status == "planificada" || it.status == "en_progreso" }
    val doneCount = activities.count { it.status == "completada" }

    // ── Cámara para agregar evidencia a una actividad existente ──
    // Solo cámara en vivo: la evidencia de campo debe ser del momento
    // (desde la web sí se pueden adjuntar archivos para regularizar).
    // rememberSaveable: la cámara puede matar el proceso; sin esto la foto se perdería
    var photoTargetUuid by rememberSaveable { mutableStateOf<String?>(null) }
    var pendingPhotoPath by rememberSaveable { mutableStateOf<String?>(null) }

    fun createImageFile(): Pair<Uri, String> {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val storageDir = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES)
        val imageFile = File.createTempFile("AGRA_ACT_${timeStamp}_", ".jpg", storageDir)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", imageFile)
        return Pair(uri, imageFile.absolutePath)
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        val path = pendingPhotoPath
        val uuid = photoTargetUuid
        if (success && path != null && uuid != null) {
            scope.launch {
                // Procesar en el teléfono: máx 8MP, calidad media
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    com.agratec.fieldapp.util.ImageProcessor.compressInPlace(path)
                }
                repository.addPhoto(uuid, path)
                Toast.makeText(context, "Foto agregada 📷 (se sube al sincronizar)", Toast.LENGTH_SHORT).show()
            }
        }
        pendingPhotoPath = null
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val (uri, realPath) = createImageFile()
            pendingPhotoPath = realPath
            cameraLauncher.launch(uri)
        } else {
            Toast.makeText(context, "Se necesita permiso de cámara", Toast.LENGTH_SHORT).show()
        }
    }

    // Diálogo de acciones sobre una actividad
    confirmActivity?.let { act ->
        val typeUi = activityTypeUi(act.activityType)
        AlertDialog(
            onDismissRequest = { confirmActivity = null },
            title = { Text("${typeUi.emoji} ${typeUi.label}", color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("\"${act.description.take(120)}\"", color = TextSecondary)
                    Spacer(Modifier.height(4.dp))
                    if (act.status == "planificada") {
                        DialogAction("⏳", "Iniciar (en proceso)", SyncPending) {
                            scope.launch {
                                repository.setStatus(act.clientUuid, "en_progreso")
                                confirmActivity = null
                            }
                        }
                    }
                    DialogAction("📷", "Tomar foto de evidencia", StatusInProgress) {
                        photoTargetUuid = act.clientUuid
                        confirmActivity = null
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                    if (act.products().isNotEmpty()) {
                        DialogAction("🧪", "Registrar lo que se usó", AgraEmerald600) {
                            consumptionActivity = act
                            confirmActivity = null
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repository.setStatus(act.clientUuid, "completada")
                        confirmActivity = null
                    }
                }) {
                    Text("✅ Completar", color = AgraGreen, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmActivity = null }) { Text("Cancelar", color = TextTertiary) }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(20.dp),
        )
    }

    // Captura de lo realmente consumido, contra lo planeado
    consumptionActivity?.let { act ->
        ConsumptionDialog(
            products = act.products(),
            onDismiss = { consumptionActivity = null },
            onSave = { updated ->
                scope.launch {
                    repository.updateProducts(act.clientUuid, updated)
                    Toast.makeText(context, "Consumo registrado ✅", Toast.LENGTH_SHORT).show()
                    consumptionActivity = null
                }
            },
        )
    }

    Column(Modifier.fillMaxSize()) {
        AgraHeader(
            title = "Libreta de Campo",
            subtitle = "$pendingCount por realizar · $doneCount realizadas",
            emoji = "📖",
            badge = if (unsyncedCount > 0) "$unsyncedCount sin subir" else null,
            actions = {
                AgraSyncAction(unsyncedCount = unsyncedCount, onClick = onSync)
                AgraHeaderAction(Icons.Default.Settings, "Ajustes", onOpenSettings)
            },
        )

        syncStatus?.let { status ->
            AgraSyncBanner(
                message = status.message,
                at = status.at,
                ok = status.ok,
                photosWaiting = status.photosWaitingForWifi,
                onPhotosClick = onOpenSettings,
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AgraChip("🗓️ Por realizar ($pendingCount)", filter == "pendientes", onClick = { filter = "pendientes" })
            AgraChip("✅ Realizadas", filter == "realizadas", onClick = { filter = "realizadas" })
            AgraChip("Todas", filter == "todas", onClick = { filter = "todas" })
        }

        if (filtered.isEmpty()) {
            AgraEmptyState(
                emoji = "📖",
                title = when (filter) {
                    "pendientes" -> "No hay actividades pendientes"
                    "realizadas" -> "Aún no hay actividades realizadas"
                    else -> "Aún no hay actividades"
                },
                message = "Registra riegos, fertilizaciones, podas y más con el botón Nueva actividad.",
                modifier = Modifier.weight(1f),
            )
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 160.dp, top = 4.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(filtered, key = { it.id }) { act ->
                    ActivityCard(
                        activity = act,
                        onClick = {
                            if (act.status != "completada" && act.status != "cancelada") {
                                confirmActivity = act
                            } else {
                                // Completadas: permitir agregar más evidencia
                                photoTargetUuid = act.clientUuid
                                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                            }
                        },
                    )
                }
            }
        }
    }
}

/** Acción secundaria dentro de un diálogo, con el mismo aire en toda la app */
@Composable
private fun DialogAction(emoji: String, label: String, color: Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(color.copy(alpha = 0.08f))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(emoji, fontSize = 15.sp)
        Spacer(Modifier.width(8.dp))
        Text(label, color = color, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ActivityCard(activity: FieldActivityEntity, onClick: () -> Unit) {
    val typeUi = activityTypeUi(activity.activityType)
    val (statusLabel, statusColor) = statusLabelUi(activity.status)
    val products = activity.products()

    GlassCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(typeUi.color.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(typeUi.emoji, fontSize = 20.sp)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(typeUi.label, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    activity.activitySubtype?.let {
                        Spacer(Modifier.width(6.dp))
                        Text(it, color = TextTertiary, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (activity.description.isNotBlank()) {
                    Text(
                        activity.description,
                        color = TextSecondary,
                        fontSize = 12.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Spacer(Modifier.height(3.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val days = activity.workSessions()
                    val timeLabel = when {
                        days.size > 1 -> "📅 ${activity.activityDate} · ${days.size} días"
                        !activity.startTime.isNullOrBlank() && !activity.endTime.isNullOrBlank() ->
                            "📅 ${activity.activityDate} · ${activity.startTime}–${activity.endTime}"
                        else -> "📅 ${activity.activityDate}"
                    }
                    Text(timeLabel, color = TextTertiary, fontSize = 11.sp)
                    if (activity.performedBy.isNotBlank()) {
                        Text("  ·  👤 ${activity.performedBy}", color = TextTertiary, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (products.isNotEmpty()) {
                    Spacer(Modifier.height(5.dp))
                    Text(
                        "🧪 " + products.joinToString(" · ") { p ->
                            val cantidad = p.used ?: p.planned
                            if (cantidad != null) "${p.name} ${cantidad}${p.unit}" else p.name
                        },
                        color = AgraEmerald600,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(statusColor.copy(alpha = 0.12f))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                ) {
                    Text(statusLabel, color = statusColor, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(6.dp))
                AgraSyncDot(activity.isSynced)
            }
        }
    }
}

/**
 * Captura de lo realmente utilizado, con lo planeado a la vista para comparar.
 */
@Composable
private fun ConsumptionDialog(
    products: List<ActivityProduct>,
    onDismiss: () -> Unit,
    onSave: (List<ActivityProduct>) -> Unit,
) {
    var edited by remember { mutableStateOf(products) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("¿Cuánto se usó?", color = TextPrimary, fontWeight = FontWeight.Bold) },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()),
            ) {
                edited.forEachIndexed { idx, product ->
                    Column {
                        Text(product.name, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Planeado: ${product.planned ?: "sin definir"} ${ProductRepository.unitLabel(product.unit).lowercase()}",
                            color = TextTertiary,
                            fontSize = 11.sp,
                        )
                        Spacer(Modifier.height(6.dp))
                        AgraTextField(
                            value = product.used ?: "",
                            onValueChange = { value ->
                                edited = edited.mapIndexed { i, p ->
                                    if (i == idx) p.copy(used = value.take(32)) else p
                                }
                            },
                            label = "Utilizado (${product.unit})",
                            keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal,
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(edited) }) {
                Text("Guardar", color = AgraGreen, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar", color = TextTertiary) }
        },
        containerColor = Color.White,
        shape = RoundedCornerShape(20.dp),
    )
}
