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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.agratec.fieldapp.data.local.entity.FieldActivityEntity
import com.agratec.fieldapp.data.prefs.SyncPreferences
import com.agratec.fieldapp.data.repository.FieldActivityRepository
import com.agratec.fieldapp.sync.NetworkUtils
import com.agratec.fieldapp.sync.SyncStatus
import com.agratec.fieldapp.sync.SyncWorker
import com.agratec.fieldapp.ui.components.PhotoPolicyDialog
import com.agratec.fieldapp.ui.components.PhotoSettingsDialog
import com.agratec.fieldapp.ui.components.AgraBottomBar
import com.agratec.fieldapp.ui.components.GlassCard
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
 * Pantalla de la Libreta de Campo:
 * lista de actividades (planificadas desde la web o creadas en el campo),
 * con filtro por estado y acción rápida para marcarlas completadas.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivitiesListScreen(
    onCreateActivity: () -> Unit,
    onBackToNotes: () -> Unit,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { FieldActivityRepository(context) }
    val activities by repository.getAll().collectAsState(initial = emptyList())

    var filter by remember { mutableStateOf("pendientes") } // pendientes | realizadas | todas
    var unsyncedCount by remember { mutableIntStateOf(0) }
    var confirmActivity by remember { mutableStateOf<FieldActivityEntity?>(null) }

    // Estado de la última sincronización (para que el usuario sepa qué pasó)
    val syncStatus by SyncStatus.state.collectAsState()
    var showPhotoPolicyDialog by remember { mutableStateOf(false) }
    var showPhotoSettings by remember { mutableStateOf(false) }
    var uploadOnMobile by remember {
        mutableStateOf(SyncPreferences.uploadPolicy(context) == SyncPreferences.Policy.ALLOW)
    }
    var downloadOnMobile by remember {
        mutableStateOf(SyncPreferences.downloadPolicy(context) == SyncPreferences.Policy.ALLOW)
    }

    LaunchedEffect(activities) {
        unsyncedCount = repository.getUnsyncedCount()
    }

    // Al abrir: cargar estado previo, bajar datos frescos del servidor y
    // preguntar por las fotos si estamos con datos móviles y nunca se preguntó
    LaunchedEffect(Unit) {
        SyncStatus.load(context)
        repository.pullFromServer()
        val onMobile = !NetworkUtils.isUnmetered(context) && NetworkUtils.isConnected(context)
        if (onMobile && !SyncPreferences.hasBeenAsked(context)) {
            showPhotoPolicyDialog = true
        }
    }

    if (showPhotoPolicyDialog) {
        PhotoPolicyDialog(
            pendingPhotos = syncStatus?.photosWaitingForWifi ?: 0,
            onDecide = { allowUpload, allowDownload ->
                SyncPreferences.setUploadPolicy(context, if (allowUpload) SyncPreferences.Policy.ALLOW else SyncPreferences.Policy.WIFI_ONLY)
                SyncPreferences.setDownloadPolicy(context, if (allowDownload) SyncPreferences.Policy.ALLOW else SyncPreferences.Policy.WIFI_ONLY)
                SyncPreferences.markAsked(context)
                uploadOnMobile = allowUpload
                downloadOnMobile = allowDownload
                showPhotoPolicyDialog = false
                SyncWorker.enqueueImmediateSync(context)
            },
            onDismiss = {
                SyncPreferences.markAsked(context)
                showPhotoPolicyDialog = false
            },
        )
    }

    if (showPhotoSettings) {
        PhotoSettingsDialog(
            uploadOnMobile = uploadOnMobile,
            downloadOnMobile = downloadOnMobile,
            onChange = { up, down ->
                SyncPreferences.setUploadPolicy(context, if (up) SyncPreferences.Policy.ALLOW else SyncPreferences.Policy.WIFI_ONLY)
                SyncPreferences.setDownloadPolicy(context, if (down) SyncPreferences.Policy.ALLOW else SyncPreferences.Policy.WIFI_ONLY)
                SyncPreferences.markAsked(context)
                uploadOnMobile = up
                downloadOnMobile = down
            },
            onDismiss = { showPhotoSettings = false },
        )
    }

    val filtered = when (filter) {
        "pendientes" -> activities.filter { it.status == "planificada" || it.status == "en_progreso" }
        "realizadas" -> activities.filter { it.status == "completada" }
        else -> activities
    }
    val pendingCount = activities.count { it.status == "planificada" || it.status == "en_progreso" }
    val doneCount = activities.count { it.status == "completada" }

    // ── Cámara para agregar fotos a una actividad existente ──
    // rememberSaveable: la cámara puede matar el proceso; sin esto la foto se perdería
    var photoTargetUuid by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf<String?>(null) }
    var pendingPhotoPath by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf<String?>(null) }

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

    // Diálogo de acciones sobre una actividad pendiente
    confirmActivity?.let { act ->
        val typeUi = activityTypeUi(act.activityType)
        AlertDialog(
            onDismissRequest = { confirmActivity = null },
            title = { Text("${typeUi.emoji} ${typeUi.label}", color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("\"${act.description.take(120)}\"", color = TextSecondary)
                    // Acciones secundarias dentro del cuerpo del diálogo
                    if (act.status == "planificada") {
                        TextButton(onClick = {
                            scope.launch {
                                repository.setStatus(act.clientUuid, "en_progreso")
                                confirmActivity = null
                            }
                        }) {
                            Text("⏳ Iniciar (en proceso)", color = SyncPending, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    TextButton(onClick = {
                        photoTargetUuid = act.clientUuid
                        confirmActivity = null
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }) {
                        Text("📷 Tomar foto de evidencia", color = StatusInProgress, fontWeight = FontWeight.SemiBold)
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
                TextButton(onClick = { confirmActivity = null }) {
                    Text("Cancelar", color = TextTertiary)
                }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(20.dp),
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(AgraGreenSurface, AgraEmerald50, AgraTeal50),
                    start = Offset(0f, 0f),
                    end = Offset(1000f, 2000f),
                )
            ),
    ) {
        Column(Modifier.fillMaxSize()) {
            // ── Header ──
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(elevation = 2.dp, shape = RoundedCornerShape(0.dp), ambientColor = Color.Black.copy(alpha = 0.04f))
                    .background(Color.White.copy(alpha = 0.88f))
                    .statusBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Brush.horizontalGradient(listOf(AgraGreen, AgraEmerald600))),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("📖", fontSize = 20.sp)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("Libreta de Campo", color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "$pendingCount por realizar · $doneCount realizadas",
                            color = TextSecondary,
                            fontSize = 12.sp,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    if (unsyncedCount > 0) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(SyncPending.copy(alpha = 0.15f))
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Text("$unsyncedCount sin sync", color = SyncPending, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    IconButton(onClick = { showPhotoSettings = true }) {
                        Icon(Icons.Default.Settings, contentDescription = "Ajustes de fotos", tint = TextTertiary, modifier = Modifier.size(20.dp))
                    }
                }
            }

            // ── Estado de la última sincronización ──
            syncStatus?.let { status ->
                val bg = if (status.ok) AgraGreenSurface else Color(0xFFFEF2F2)
                val fg = if (status.ok) AgraEmerald600 else SyncError
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(bg)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        if (status.ok) Icons.Default.CloudDone else Icons.Default.ErrorOutline,
                        contentDescription = null,
                        tint = fg,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text("${status.message} · ${status.at}", color = fg, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        if (status.photosWaitingForWifi > 0) {
                            Text(
                                "${status.photosWaitingForWifi} foto${if (status.photosWaitingForWifi == 1) "" else "s"} esperan WiFi · toca para cambiarlo",
                                color = SyncPending,
                                fontSize = 11.sp,
                                modifier = Modifier.clickable { showPhotoSettings = true },
                            )
                        }
                    }
                }
            }

            // ── Filtros ──
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = filter == "pendientes",
                    onClick = { filter = "pendientes" },
                    label = { Text("🗓️ Por realizar ($pendingCount)") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = AgraGreen,
                        selectedLabelColor = Color.White,
                    ),
                )
                FilterChip(
                    selected = filter == "realizadas",
                    onClick = { filter = "realizadas" },
                    label = { Text("✅ Realizadas") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = AgraGreen,
                        selectedLabelColor = Color.White,
                    ),
                )
                FilterChip(
                    selected = filter == "todas",
                    onClick = { filter = "todas" },
                    label = { Text("Todas") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = AgraGreen,
                        selectedLabelColor = Color.White,
                    ),
                )
            }

            // ── Lista ──
            if (filtered.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text("📖", fontSize = 44.sp)
                    Spacer(Modifier.height(12.dp))
                    Text(
                        when (filter) {
                            "pendientes" -> "No hay actividades pendientes"
                            "realizadas" -> "Aún no hay actividades realizadas"
                            else -> "Aún no hay actividades"
                        },
                        color = TextSecondary,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Registra riegos, fertilizaciones, podas y más con el botón Nueva Actividad",
                        color = TextTertiary,
                        fontSize = 13.sp,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 110.dp, top = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(filtered, key = { it.id }) { act ->
                        ActivityCard(
                            activity = act,
                            onClick = {
                                if (act.status != "completada" && act.status != "cancelada") {
                                    confirmActivity = act
                                } else {
                                    // Completadas: permitir agregar foto de evidencia
                                    photoTargetUuid = act.clientUuid
                                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                                }
                            },
                        )
                    }
                }
            }
        }

        AgraBottomBar(
            unsyncedCount = unsyncedCount,
            onSync = {
                // Sync manual = intención explícita: dar otra oportunidad a los rechazados
                scope.launch {
                    repository.resetFailedSyncAttempts()
                    SyncWorker.enqueueImmediateSync(context)
                    val red = when (com.agratec.fieldapp.sync.NetworkUtils.currentType(context)) {
                        com.agratec.fieldapp.sync.NetworkUtils.NetworkType.NONE -> "Sin conexión: se sincronizará al recuperar señal"
                        com.agratec.fieldapp.sync.NetworkUtils.NetworkType.WIFI -> "Sincronizando por WiFi (datos y fotos)..."
                        com.agratec.fieldapp.sync.NetworkUtils.NetworkType.MOBILE ->
                            if (uploadOnMobile) "Sincronizando por datos (datos y fotos)..."
                            else "Sincronizando datos... las fotos esperarán WiFi"
                    }
                    Toast.makeText(context, red, Toast.LENGTH_SHORT).show()
                }
            },
            onCreateNote = onCreateActivity,
            onLogout = onLogout,
            createLabel = "Nueva Actividad",
            switchLabel = "Notas",
            switchIcon = Icons.Default.StickyNote2,
            onSwitch = onBackToNotes,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

@Composable
private fun ActivityCard(activity: FieldActivityEntity, onClick: () -> Unit) {
    val typeUi = activityTypeUi(activity.activityType)
    val (statusLabel, statusColor) = statusLabelUi(activity.status)

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
                Spacer(Modifier.height(4.dp))
                Icon(
                    if (activity.isSynced) Icons.Default.CloudDone else Icons.Default.CloudUpload,
                    contentDescription = null,
                    tint = if (activity.isSynced) SyncOk else SyncPending,
                    modifier = Modifier.size(15.dp),
                )
            }
        }
    }
}
