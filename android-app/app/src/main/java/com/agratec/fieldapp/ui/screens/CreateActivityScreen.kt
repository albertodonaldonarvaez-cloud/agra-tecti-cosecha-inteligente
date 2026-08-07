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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import com.agratec.fieldapp.data.local.entity.CollaboratorEntity
import com.agratec.fieldapp.data.local.entity.ParcelEntity
import com.agratec.fieldapp.data.local.entity.WorkSession
import com.agratec.fieldapp.data.repository.AuthRepository
import com.agratec.fieldapp.data.repository.CollaboratorRepository
import com.agratec.fieldapp.data.repository.FieldActivityRepository
import com.agratec.fieldapp.data.repository.ParcelRepository
import com.agratec.fieldapp.ui.components.GlassCard
import com.agratec.fieldapp.ui.theme.*
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Crear una actividad de la libreta de campo (offline-first).
 * - Estado: realizada / en proceso / planificada
 * - Horas del día trabajado, o varias jornadas si tomó más de un día
 * - Colaboradores de campo (alta rápida incluida) para saber quién la hizo
 * - Varias fotos (varios ángulos de la parcela)
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CreateActivityScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { FieldActivityRepository(context) }
    val parcelRepository = remember { ParcelRepository(context) }
    val collaboratorRepository = remember { CollaboratorRepository(context) }
    val parcels by parcelRepository.getAllParcels().collectAsState(initial = emptyList())
    val collaborators by collaboratorRepository.getAll().collectAsState(initial = emptyList())

    var selectedType by remember { mutableStateOf("") }
    var selectedSubtype by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var manualPerformedBy by remember { mutableStateOf(AuthRepository.getUserName(context)) }
    var statusChoice by remember { mutableStateOf("completada") } // completada | en_progreso | planificada
    var selectedParcels by remember { mutableStateOf<Set<Int>>(emptySet()) }
    var selectedCollabUuids by remember { mutableStateOf<Set<String>>(emptySet()) }
    var isSaving by remember { mutableStateOf(false) }

    val todayStr = remember { SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()) }
    var activityDate by remember { mutableStateOf(todayStr) }
    var startTime by remember { mutableStateOf("") }
    var endTime by remember { mutableStateOf("") }

    // Multi-día: jornadas de trabajo
    var multiDay by remember { mutableStateOf(false) }
    var sessions by remember { mutableStateOf<List<WorkSession>>(emptyList()) }

    // Fotos tomadas (rutas reales en el almacenamiento de la app)
    // rememberSaveable: la cámara puede matar el proceso; sin esto las fotos se perderían
    var photoPaths by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf<List<String>>(emptyList()) }
    var pendingPhotoPath by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf<String?>(null) }

    // Alta rápida de colaborador
    var showNewCollabDialog by remember { mutableStateOf(false) }
    var newCollabName by remember { mutableStateOf("") }
    var newCollabRole by remember { mutableStateOf("") }

    // ── Selección de fechas/horas con diálogos ──
    var datePickerTarget by remember { mutableStateOf<String?>(null) } // "main" o índice de jornada
    var timePickerTarget by remember { mutableStateOf<Pair<String, String>?>(null) } // (target, "start"/"end")

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
        if (success && path != null) {
            photoPaths = photoPaths + path
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

    // ── Diálogo selector de fecha ──
    datePickerTarget?.let { target ->
        val datePickerState = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { datePickerTarget = null },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                        fmt.timeZone = TimeZone.getTimeZone("UTC")
                        val dateStr = fmt.format(Date(millis))
                        if (target == "main") {
                            activityDate = dateStr
                        } else {
                            target.toIntOrNull()?.let { idx ->
                                sessions = sessions.mapIndexed { i, s -> if (i == idx) s.copy(workDate = dateStr) else s }
                            }
                        }
                    }
                    datePickerTarget = null
                }) { Text("Aceptar", color = AgraGreen, fontWeight = FontWeight.SemiBold) }
            },
            dismissButton = {
                TextButton(onClick = { datePickerTarget = null }) { Text("Cancelar", color = TextTertiary) }
            },
        ) { DatePicker(state = datePickerState) }
    }

    // ── Diálogo selector de hora ──
    timePickerTarget?.let { (target, which) ->
        val timeState = rememberTimePickerState(is24Hour = true)
        AlertDialog(
            onDismissRequest = { timePickerTarget = null },
            title = { Text(if (which == "start") "Hora de inicio" else "Hora de fin", color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = { TimeInput(state = timeState) },
            confirmButton = {
                TextButton(onClick = {
                    val hhmm = String.format(Locale.US, "%02d:%02d", timeState.hour, timeState.minute)
                    if (target == "main") {
                        if (which == "start") startTime = hhmm else endTime = hhmm
                    } else {
                        target.toIntOrNull()?.let { idx ->
                            sessions = sessions.mapIndexed { i, s ->
                                if (i == idx) (if (which == "start") s.copy(startTime = hhmm) else s.copy(endTime = hhmm)) else s
                            }
                        }
                    }
                    timePickerTarget = null
                }) { Text("Aceptar", color = AgraGreen, fontWeight = FontWeight.SemiBold) }
            },
            dismissButton = {
                TextButton(onClick = { timePickerTarget = null }) { Text("Cancelar", color = TextTertiary) }
            },
            containerColor = Color.White,
            shape = RoundedCornerShape(20.dp),
        )
    }

    // ── Diálogo de alta rápida de colaborador ──
    if (showNewCollabDialog) {
        AlertDialog(
            onDismissRequest = { showNewCollabDialog = false },
            title = { Text("Nuevo colaborador de campo", color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = newCollabName,
                        onValueChange = { newCollabName = it.take(255) },
                        label = { Text("Nombre *") },
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = newCollabRole,
                        onValueChange = { newCollabRole = it.take(128) },
                        label = { Text("Rol (ej. Jornalero, Encargado de riego)") },
                        singleLine = true,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (newCollabName.isBlank()) return@TextButton
                        scope.launch {
                            val created = collaboratorRepository.addCollaborator(newCollabName, newCollabRole)
                            selectedCollabUuids = selectedCollabUuids + created.clientUuid
                            newCollabName = ""
                            newCollabRole = ""
                            showNewCollabDialog = false
                        }
                    },
                ) { Text("Agregar", color = AgraGreen, fontWeight = FontWeight.SemiBold) }
            },
            dismissButton = {
                TextButton(onClick = { showNewCollabDialog = false }) { Text("Cancelar", color = TextTertiary) }
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
                    .padding(horizontal = 8.dp, vertical = 8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver", tint = TextPrimary)
                    }
                    Column {
                        Text("Nueva Actividad", color = TextPrimary, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Text("Libreta de campo", color = TextSecondary, fontSize = 12.sp)
                    }
                }
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // ── Tipo de actividad ──
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Text("Tipo de actividad *", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        ACTIVITY_TYPES_UI.forEach { type ->
                            FilterChip(
                                selected = selectedType == type.value,
                                onClick = { selectedType = type.value; selectedSubtype = "" },
                                label = { Text("${type.emoji} ${type.label}", fontSize = 12.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = type.color.copy(alpha = 0.9f),
                                    selectedLabelColor = Color.White,
                                ),
                            )
                        }
                    }

                    val subtypes = ACTIVITY_SUBTYPES_UI[selectedType].orEmpty()
                    if (subtypes.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        Text("Subtipo (opcional)", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Spacer(Modifier.height(6.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            subtypes.forEach { sub ->
                                FilterChip(
                                    selected = selectedSubtype == sub,
                                    onClick = { selectedSubtype = if (selectedSubtype == sub) "" else sub },
                                    label = { Text(sub, fontSize = 11.sp) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = AgraGreen,
                                        selectedLabelColor = Color.White,
                                    ),
                                )
                            }
                        }
                    }
                }

                // ── Estado, fecha y horas ──
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Text("Estado y tiempo", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(
                            selected = statusChoice == "completada",
                            onClick = { statusChoice = "completada" },
                            label = { Text("✅ Realizada", fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = StatusResolved, selectedLabelColor = Color.White),
                        )
                        FilterChip(
                            selected = statusChoice == "en_progreso",
                            onClick = { statusChoice = "en_progreso" },
                            label = { Text("⏳ En proceso", fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = SyncPending, selectedLabelColor = Color.White),
                        )
                        FilterChip(
                            selected = statusChoice == "planificada",
                            onClick = { statusChoice = "planificada" },
                            label = { Text("🗓️ Planificada", fontSize = 11.sp) },
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = StatusInProgress, selectedLabelColor = Color.White),
                        )
                    }

                    Spacer(Modifier.height(12.dp))

                    // Fecha + toggle multi-día
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PickerField(
                            label = if (multiDay) "Primer día" else "Fecha",
                            value = activityDate,
                            icon = Icons.Default.CalendarMonth,
                            onClick = { datePickerTarget = "main" },
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("¿Varios días?", color = TextSecondary, fontSize = 11.sp)
                            Switch(
                                checked = multiDay,
                                onCheckedChange = { checked ->
                                    multiDay = checked
                                    if (checked && sessions.isEmpty()) {
                                        sessions = listOf(WorkSession(activityDate, startTime.ifBlank { null }, endTime.ifBlank { null }))
                                    }
                                },
                                colors = SwitchDefaults.colors(checkedTrackColor = AgraGreen),
                            )
                        }
                    }

                    Spacer(Modifier.height(10.dp))

                    if (!multiDay) {
                        // Horas del día (de qué hora a qué hora)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            PickerField(
                                label = "Desde",
                                value = startTime.ifBlank { "--:--" },
                                icon = Icons.Default.Schedule,
                                onClick = { timePickerTarget = "main" to "start" },
                                modifier = Modifier.weight(1f),
                            )
                            PickerField(
                                label = "Hasta",
                                value = endTime.ifBlank { "--:--" },
                                icon = Icons.Default.Schedule,
                                onClick = { timePickerTarget = "main" to "end" },
                                modifier = Modifier.weight(1f),
                            )
                        }
                        sessionHoursLabel(startTime, endTime)?.let {
                            Spacer(Modifier.height(4.dp))
                            Text(it, color = AgraGreen, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                    } else {
                        // Jornadas: un renglón por día con sus horas
                        sessions.forEachIndexed { idx, s ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(vertical = 3.dp),
                            ) {
                                Text("Día ${idx + 1}", color = AgraGreen, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(40.dp))
                                PickerField(
                                    label = null,
                                    value = s.workDate,
                                    icon = Icons.Default.CalendarMonth,
                                    onClick = { datePickerTarget = idx.toString() },
                                    modifier = Modifier.weight(1.3f),
                                    compact = true,
                                )
                                Spacer(Modifier.width(6.dp))
                                PickerField(
                                    label = null,
                                    value = s.startTime ?: "--:--",
                                    icon = null,
                                    onClick = { timePickerTarget = idx.toString() to "start" },
                                    modifier = Modifier.weight(1f),
                                    compact = true,
                                )
                                Spacer(Modifier.width(6.dp))
                                PickerField(
                                    label = null,
                                    value = s.endTime ?: "--:--",
                                    icon = null,
                                    onClick = { timePickerTarget = idx.toString() to "end" },
                                    modifier = Modifier.weight(1f),
                                    compact = true,
                                )
                                IconButton(onClick = { sessions = sessions.filterIndexed { i, _ -> i != idx } }) {
                                    Icon(Icons.Default.Close, contentDescription = "Quitar día", tint = SyncError, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                        TextButton(onClick = {
                            val lastDate = sessions.lastOrNull()?.workDate ?: activityDate
                            val cal = java.util.Calendar.getInstance()
                            try {
                                cal.time = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(lastDate) ?: Date()
                                cal.add(java.util.Calendar.DAY_OF_MONTH, 1)
                            } catch (_: Exception) { }
                            val nextDate = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)
                            sessions = sessions + WorkSession(nextDate, sessions.lastOrNull()?.startTime, sessions.lastOrNull()?.endTime)
                        }) {
                            Text("+ Agregar día", color = AgraGreen, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                        val totalH = sessions.sumOf { sessionMinutes(it.startTime, it.endTime) } / 60.0
                        if (totalH > 0) {
                            Text(
                                "Total: ${String.format(Locale.US, "%.1f", totalH)} horas en ${sessions.size} día(s)",
                                color = AgraGreen, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }

                // ── Colaboradores (quién lo hizo) ──
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("¿Quién la realiza?", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = { showNewCollabDialog = true }) {
                            Text("+ Nuevo", color = AgraGreen, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    if (collaborators.isEmpty()) {
                        Text(
                            "Da de alta a tu gente de campo con \"+ Nuevo\" para llevar control de quién hizo cada actividad",
                            color = TextTertiary, fontSize = 12.sp,
                        )
                    } else {
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            collaborators.forEach { collab: CollaboratorEntity ->
                                FilterChip(
                                    selected = selectedCollabUuids.contains(collab.clientUuid),
                                    onClick = {
                                        selectedCollabUuids = if (selectedCollabUuids.contains(collab.clientUuid))
                                            selectedCollabUuids - collab.clientUuid else selectedCollabUuids + collab.clientUuid
                                    },
                                    label = {
                                        Text(
                                            collab.name + (collab.role?.let { " · $it" } ?: "") + (if (!collab.isSynced) " ⏳" else ""),
                                            fontSize = 11.sp,
                                        )
                                    },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = AgraGreen,
                                        selectedLabelColor = Color.White,
                                    ),
                                )
                            }
                        }
                    }
                    if (selectedCollabUuids.isEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            value = manualPerformedBy,
                            onValueChange = { manualPerformedBy = it.take(255) },
                            label = { Text("O escribe quién la realiza") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = AgraGreen,
                                unfocusedBorderColor = CardBorder,
                            ),
                        )
                    }
                }

                // ── Descripción ──
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Text("Descripción *", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it },
                        label = { Text("¿Qué se hizo / se hará?") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = AgraGreen,
                            unfocusedBorderColor = CardBorder,
                        ),
                    )
                }

                // ── Fotos (varios ángulos) ──
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Fotos (${photoPaths.size})", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = { cameraPermissionLauncher.launch(Manifest.permission.CAMERA) }) {
                            Icon(Icons.Default.PhotoCamera, contentDescription = null, tint = AgraGreen, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Tomar foto", color = AgraGreen, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    if (photoPaths.isEmpty()) {
                        Text("Toma varios ángulos de la parcela o del trabajo realizado", color = TextTertiary, fontSize = 12.sp)
                    } else {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(photoPaths, key = { it }) { path ->
                                Box {
                                    AsyncImage(
                                        model = File(path),
                                        contentDescription = null,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier
                                            .size(84.dp)
                                            .clip(RoundedCornerShape(12.dp)),
                                    )
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .padding(3.dp)
                                            .size(20.dp)
                                            .clip(CircleShape)
                                            .background(Color.Black.copy(alpha = 0.55f))
                                            .clickable { photoPaths = photoPaths - path },
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(Icons.Default.Close, contentDescription = "Quitar", tint = Color.White, modifier = Modifier.size(12.dp))
                                    }
                                }
                            }
                        }
                    }
                }

                // ── Parcelas ──
                GlassCard(modifier = Modifier.fillMaxWidth()) {
                    Text("Parcelas (opcional)", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    if (parcels.isEmpty()) {
                        Text("Sin parcelas en el dispositivo — se descargan al sincronizar", color = TextTertiary, fontSize = 12.sp)
                    } else {
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            parcels.forEach { parcel: ParcelEntity ->
                                val id = parcel.serverId
                                FilterChip(
                                    selected = selectedParcels.contains(id),
                                    onClick = {
                                        selectedParcels = if (selectedParcels.contains(id)) selectedParcels - id else selectedParcels + id
                                    },
                                    label = { Text(parcel.name, fontSize = 11.sp) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = AgraGreen,
                                        selectedLabelColor = Color.White,
                                    ),
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(70.dp))
            }
        }

        // ── Botón Guardar ──
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(16.dp)
                .navigationBarsPadding(),
        ) {
            val canSave = selectedType.isNotBlank() && description.isNotBlank() && !isSaving
            Button(
                onClick = {
                    scope.launch {
                        isSaving = true
                        try {
                            val selectedNames = collaborators
                                .filter { selectedCollabUuids.contains(it.clientUuid) }
                                .joinToString(", ") { it.name }
                            val performedBy = selectedNames.ifBlank { manualPerformedBy.trim() }
                            val effectiveSessions = if (multiDay) sessions.filter { it.workDate.isNotBlank() } else emptyList()
                            val effectiveDate = if (multiDay) (effectiveSessions.minOfOrNull { it.workDate } ?: activityDate) else activityDate

                            repository.createActivity(
                                activityType = selectedType,
                                activitySubtype = selectedSubtype,
                                description = description.trim(),
                                performedBy = performedBy,
                                activityDate = effectiveDate,
                                status = statusChoice,
                                parcelIds = selectedParcels.toList(),
                                startTime = if (!multiDay) startTime.ifBlank { null } else effectiveSessions.firstOrNull()?.startTime,
                                endTime = if (!multiDay) endTime.ifBlank { null } else effectiveSessions.firstOrNull()?.endTime,
                                workSessions = effectiveSessions,
                                collaboratorUuids = selectedCollabUuids.toList(),
                                photoFilePaths = photoPaths,
                            )
                            Toast.makeText(context, "Actividad guardada ✅", Toast.LENGTH_SHORT).show()
                            onBack()
                        } finally {
                            isSaving = false
                        }
                    }
                },
                enabled = canSave,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AgraGreen,
                    disabledContainerColor = AgraGreen.copy(alpha = 0.4f),
                ),
            ) {
                if (isSaving) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Default.Save, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Guardar Actividad", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

/** Campo de solo lectura que abre un selector (fecha u hora) al tocarlo */
@Composable
private fun PickerField(
    label: String?,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    Column(modifier = modifier) {
        if (label != null) {
            Text(label, color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(3.dp))
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White.copy(alpha = 0.7f))
                .clickable(onClick = onClick)
                .padding(horizontal = if (compact) 8.dp else 12.dp, vertical = if (compact) 8.dp else 11.dp),
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = AgraGreen, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
            }
            Text(value, color = TextPrimary, fontSize = if (compact) 12.sp else 14.sp, fontWeight = FontWeight.Medium)
        }
    }
}

private fun sessionMinutes(start: String?, end: String?): Int {
    if (start.isNullOrBlank() || end.isNullOrBlank()) return 0
    return try {
        val (sh, sm) = start.split(":").map { it.toInt() }
        val (eh, em) = end.split(":").map { it.toInt() }
        var mins = (eh * 60 + em) - (sh * 60 + sm)
        if (mins < 0) mins += 24 * 60
        mins
    } catch (e: Exception) { 0 }
}

private fun sessionHoursLabel(start: String, end: String): String? {
    val mins = sessionMinutes(start, end)
    if (mins <= 0) return null
    return "Duración: ${String.format(Locale.US, "%.1f", mins / 60.0)} horas"
}
