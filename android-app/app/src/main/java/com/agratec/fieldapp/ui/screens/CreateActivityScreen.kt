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
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import com.agratec.fieldapp.data.local.entity.ActivityProduct
import com.agratec.fieldapp.data.local.entity.CollaboratorEntity
import com.agratec.fieldapp.data.local.entity.ParcelEntity
import com.agratec.fieldapp.data.local.entity.ProductEntity
import com.agratec.fieldapp.data.local.entity.WorkSession
import com.agratec.fieldapp.data.repository.AuthRepository
import com.agratec.fieldapp.data.repository.CollaboratorRepository
import com.agratec.fieldapp.data.repository.FieldActivityRepository
import com.agratec.fieldapp.data.repository.ParcelRepository
import com.agratec.fieldapp.data.repository.ProductRepository
import com.agratec.fieldapp.ui.components.*
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
 * - Personal de campo (alta rápida incluida) para saber quién la hizo
 * - Productos del almacén: cuánto se planea usar y cuánto se usó
 * - Varias fotos, siempre con la cámara en vivo
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CreateActivityScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { FieldActivityRepository(context) }
    val parcelRepository = remember { ParcelRepository(context) }
    val collaboratorRepository = remember { CollaboratorRepository(context) }
    val productRepository = remember { ProductRepository(context) }
    val parcels by parcelRepository.getAllParcels().collectAsState(initial = emptyList())
    val collaborators by collaboratorRepository.getAll().collectAsState(initial = emptyList())
    val warehouse by productRepository.getAll().collectAsState(initial = emptyList())

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

    // Productos del almacén consumidos en la actividad
    var products by remember { mutableStateOf<List<ActivityProduct>>(emptyList()) }
    var showProductPicker by remember { mutableStateOf(false) }

    // Fotos tomadas (rutas reales en el almacenamiento de la app)
    // rememberSaveable: la cámara puede matar el proceso; sin esto las fotos se perderían
    var photoPaths by rememberSaveable { mutableStateOf<List<String>>(emptyList()) }
    var pendingPhotoPath by rememberSaveable { mutableStateOf<String?>(null) }

    // Alta rápida de personal
    var showNewCollabDialog by remember { mutableStateOf(false) }
    var newCollabName by remember { mutableStateOf("") }
    var newCollabRole by remember { mutableStateOf("") }

    // ── Selección de fechas/horas con diálogos ──
    var datePickerTarget by remember { mutableStateOf<String?>(null) } // "main" o índice de jornada
    var timePickerTarget by remember { mutableStateOf<Pair<String, String>?>(null) } // (target, "start"/"end")

    LaunchedEffect(Unit) {
        // Traer catálogos frescos: personal y almacén dados de alta en otro lado
        collaboratorRepository.pullFromServer()
        productRepository.pullFromServer()
    }

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
            // Procesar en el teléfono: máx 8MP, calidad media (pesa mucho menos al subir)
            scope.launch {
                kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                    com.agratec.fieldapp.util.ImageProcessor.compressInPlace(path)
                }
                photoPaths = photoPaths + path
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

    // ── Alta rápida de personal ──
    if (showNewCollabDialog) {
        val roles = remember { collaboratorRepository.roles() }
        AlertDialog(
            onDismissRequest = { showNewCollabDialog = false },
            title = { Text("Nuevo personal de campo", color = TextPrimary, fontWeight = FontWeight.Bold) },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                ) {
                    AgraTextField(
                        value = newCollabName,
                        onValueChange = { newCollabName = it.take(255) },
                        label = "Nombre *",
                    )
                    Text("Puesto", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        roles.forEach { role ->
                            AgraChip(
                                label = role,
                                selected = newCollabRole == role,
                                onClick = { newCollabRole = if (newCollabRole == role) "" else role },
                            )
                        }
                    }
                    AgraTextField(
                        value = newCollabRole,
                        onValueChange = { newCollabRole = it.take(128) },
                        label = "O escribe otro puesto",
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

    // ── Selector de producto del almacén ──
    if (showProductPicker) {
        ProductPickerDialog(
            warehouse = warehouse.filter { w -> products.none { it.productUuid == w.clientUuid } },
            onDismiss = { showProductPicker = false },
            onPick = { product ->
                // Al elegir el producto se carga sola su unidad de medida
                products = products + ActivityProduct(
                    productUuid = product.clientUuid,
                    serverId = product.serverId,
                    name = product.displayName(),
                    unit = product.unit,
                )
                showProductPicker = false
            },
        )
    }

    AgraScreen {
        Column(Modifier.fillMaxSize()) {
            AgraHeader(
                title = "Nueva Actividad",
                subtitle = "Libreta de campo",
                onBack = onBack,
            )

            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // ── Tipo de actividad ──
                AgraSection(title = "Tipo de actividad *") {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        ACTIVITY_TYPES_UI.forEach { type ->
                            AgraChip(
                                label = "${type.emoji} ${type.label}",
                                selected = selectedType == type.value,
                                onClick = { selectedType = type.value; selectedSubtype = "" },
                                color = type.color,
                            )
                        }
                    }

                    val subtypes = ACTIVITY_SUBTYPES_UI[selectedType].orEmpty()
                    if (subtypes.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        Text("Subtipo (opcional)", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Spacer(Modifier.height(6.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            subtypes.forEach { sub ->
                                AgraChip(
                                    label = sub,
                                    selected = selectedSubtype == sub,
                                    onClick = { selectedSubtype = if (selectedSubtype == sub) "" else sub },
                                )
                            }
                        }
                    }
                }

                // ── Estado, fecha y horas ──
                AgraSection(title = "Estado y tiempo") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        AgraChip("✅ Realizada", statusChoice == "completada", { statusChoice = "completada" }, color = StatusResolved)
                        AgraChip("⏳ En proceso", statusChoice == "en_progreso", { statusChoice = "en_progreso" }, color = SyncPending)
                        AgraChip("🗓️ Planificada", statusChoice == "planificada", { statusChoice = "planificada" }, color = StatusInProgress)
                    }

                    Spacer(Modifier.height(12.dp))

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
                        sessions.forEachIndexed { idx, s ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(vertical = 3.dp),
                            ) {
                                Text("Día ${idx + 1}", color = AgraGreen, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(40.dp))
                                PickerField(
                                    label = null, value = s.workDate, icon = Icons.Default.CalendarMonth,
                                    onClick = { datePickerTarget = idx.toString() },
                                    modifier = Modifier.weight(1.3f), compact = true,
                                )
                                Spacer(Modifier.width(6.dp))
                                PickerField(
                                    label = null, value = s.startTime ?: "--:--", icon = null,
                                    onClick = { timePickerTarget = idx.toString() to "start" },
                                    modifier = Modifier.weight(1f), compact = true,
                                )
                                Spacer(Modifier.width(6.dp))
                                PickerField(
                                    label = null, value = s.endTime ?: "--:--", icon = null,
                                    onClick = { timePickerTarget = idx.toString() to "end" },
                                    modifier = Modifier.weight(1f), compact = true,
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

                // ── Personal (quién lo hizo) ──
                AgraSection(
                    title = "¿Quién la realiza?",
                    actionLabel = "+ Nuevo",
                    onAction = { showNewCollabDialog = true },
                ) {
                    if (collaborators.isEmpty()) {
                        Text(
                            "Da de alta a tu gente en la sección Personal (o con \"+ Nuevo\") para llevar control de quién hizo cada actividad",
                            color = TextTertiary, fontSize = 12.sp,
                        )
                    } else {
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            collaborators.forEach { collab: CollaboratorEntity ->
                                AgraChip(
                                    label = collab.name + (collab.role?.let { " · $it" } ?: "") + (if (!collab.isSynced) " ⏳" else ""),
                                    selected = selectedCollabUuids.contains(collab.clientUuid),
                                    onClick = {
                                        selectedCollabUuids = if (selectedCollabUuids.contains(collab.clientUuid))
                                            selectedCollabUuids - collab.clientUuid else selectedCollabUuids + collab.clientUuid
                                    },
                                )
                            }
                        }
                    }
                    if (selectedCollabUuids.isEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        AgraTextField(
                            value = manualPerformedBy,
                            onValueChange = { manualPerformedBy = it.take(255) },
                            label = "O escribe quién la realiza",
                        )
                    }
                }

                // ── Productos del almacén ──
                AgraSection(
                    title = "Productos del almacén",
                    hint = "Anota lo que planeas usar; al completarla registras lo que realmente se usó.",
                    actionLabel = "+ Agregar",
                    onAction = { showProductPicker = true },
                ) {
                    if (products.isEmpty()) {
                        Text(
                            if (warehouse.isEmpty())
                                "Aún no hay productos en el almacén. Agrégalos en la sección Almacén."
                            else "Sin productos. Toca \"+ Agregar\" para elegirlos del almacén.",
                            color = TextTertiary, fontSize = 12.sp,
                        )
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            products.forEachIndexed { idx, product ->
                                ProductRow(
                                    product = product,
                                    onPlannedChange = { value ->
                                        products = products.mapIndexed { i, p -> if (i == idx) p.copy(planned = value) else p }
                                    },
                                    onUsedChange = { value ->
                                        products = products.mapIndexed { i, p -> if (i == idx) p.copy(used = value) else p }
                                    },
                                    onRemove = { products = products.filterIndexed { i, _ -> i != idx } },
                                )
                            }
                        }
                    }
                }

                // ── Descripción ──
                AgraSection(title = "Descripción *") {
                    AgraTextField(
                        value = description,
                        onValueChange = { description = it },
                        label = "¿Qué se hizo / se hará?",
                        singleLine = false,
                        minLines = 3,
                    )
                }

                // ── Fotos (varios ángulos) ──
                AgraSection(
                    title = "Fotos (${photoPaths.size})",
                    hint = "Solo cámara: la evidencia se toma en el momento.",
                    actionLabel = "📷 Tomar foto",
                    onAction = { cameraPermissionLauncher.launch(Manifest.permission.CAMERA) },
                ) {
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
                AgraSection(title = "Parcelas (opcional)") {
                    if (parcels.isEmpty()) {
                        Text("Sin parcelas en el dispositivo — se descargan al sincronizar", color = TextTertiary, fontSize = 12.sp)
                    } else {
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            parcels.forEach { parcel: ParcelEntity ->
                                val id = parcel.serverId
                                AgraChip(
                                    label = parcel.name,
                                    selected = selectedParcels.contains(id),
                                    onClick = {
                                        selectedParcels = if (selectedParcels.contains(id)) selectedParcels - id else selectedParcels + id
                                    },
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
            AgraPrimaryButton(
                text = "Guardar Actividad",
                icon = Icons.Default.Save,
                enabled = selectedType.isNotBlank() && description.isNotBlank(),
                loading = isSaving,
                modifier = Modifier.fillMaxWidth(),
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
                                products = products,
                            )
                            Toast.makeText(context, "Actividad guardada ✅", Toast.LENGTH_SHORT).show()
                            onBack()
                        } finally {
                            isSaving = false
                        }
                    }
                },
            )
        }
    }
}

/** Renglón de un producto consumido: unidad fija del catálogo, planeado y usado */
@Composable
private fun ProductRow(
    product: ActivityProduct,
    onPlannedChange: (String) -> Unit,
    onUsedChange: (String) -> Unit,
    onRemove: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White.copy(alpha = 0.6f))
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("🧪", fontSize = 15.sp)
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(product.name, color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                Text(
                    "Se mide en ${ProductRepository.unitLabel(product.unit).lowercase()}",
                    color = TextTertiary, fontSize = 11.sp,
                )
            }
            IconButton(onClick = onRemove, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Default.Close, contentDescription = "Quitar producto", tint = SyncError, modifier = Modifier.size(15.dp))
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AgraTextField(
                value = product.planned ?: "",
                onValueChange = { onPlannedChange(it.take(32)) },
                label = "Planeada (${product.unit})",
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
            AgraTextField(
                value = product.used ?: "",
                onValueChange = { onUsedChange(it.take(32)) },
                label = "Utilizada (${product.unit})",
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

/** Elegir un producto del almacén; su unidad de medida se copia sola */
@Composable
private fun ProductPickerDialog(
    warehouse: List<ProductEntity>,
    onDismiss: () -> Unit,
    onPick: (ProductEntity) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Elegir del almacén", color = TextPrimary, fontWeight = FontWeight.Bold) },
        text = {
            if (warehouse.isEmpty()) {
                Text(
                    "No hay más productos disponibles. Puedes darlos de alta en la sección Almacén, incluso sin internet.",
                    color = TextSecondary, fontSize = 13.sp,
                )
            } else {
                Column(
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                ) {
                    warehouse.forEach { product ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { onPick(product) }
                                .padding(horizontal = 10.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(product.displayName(), color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                                Text(
                                    ProductRepository.categoryLabel(product.category),
                                    color = TextTertiary, fontSize = 11.sp,
                                )
                            }
                            StatusBadge(text = ProductRepository.unitLabel(product.unit), color = StatusInProgress)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cerrar", color = TextTertiary) }
        },
        containerColor = Color.White,
        shape = RoundedCornerShape(20.dp),
    )
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
