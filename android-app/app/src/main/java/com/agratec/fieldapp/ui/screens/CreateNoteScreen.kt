package com.agratec.fieldapp.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.location.Location
import android.net.Uri
import android.os.Environment
import android.os.Looper
import android.util.Log
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import com.agratec.fieldapp.data.local.entity.ParcelEntity
import com.agratec.fieldapp.data.repository.FieldNoteRepository
import com.agratec.fieldapp.data.repository.ParcelRepository
import com.agratec.fieldapp.sync.SyncWorker
import com.agratec.fieldapp.ui.components.GlassCard
import com.agratec.fieldapp.ui.theme.*
import com.google.android.gms.location.*
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

data class CategoryOption(val key: String, val label: String, val icon: ImageVector, val color: Color)

private val categories = listOf(
    CategoryOption("plaga_enfermedad", "Plaga/Enfermedad", Icons.Default.BugReport, CatPlaga),
    CategoryOption("riego_drenaje", "Riego/Drenaje", Icons.Default.Water, CatRiego),
    CategoryOption("arboles_mal_plantados", "Árboles", Icons.Default.Forest, CatArboles),
    CategoryOption("dano_mecanico", "Daño Mecánico", Icons.Default.Warning, CatDano),
    CategoryOption("maleza", "Maleza", Icons.Default.Grass, CatMaleza),
    CategoryOption("fertilizacion", "Fertilización", Icons.Default.Science, CatFertilizacion),
    CategoryOption("suelo", "Suelo", Icons.Default.Terrain, CatSuelo),
    CategoryOption("infraestructura", "Infraestructura", Icons.Default.Construction, CatInfra),
    CategoryOption("fauna", "Fauna", Icons.Default.Pets, CatFauna),
    CategoryOption("otro", "Otro", Icons.Default.Notes, CatOtro),
)

private val severities = listOf(
    "baja" to SeverityLow,
    "media" to SeverityMedium,
    "alta" to SeverityHigh,
    "critica" to SeverityCritical,
)

// Severity dot colors matching frontend (more vibrant)
private val severityDots = mapOf(
    "baja" to Color(0xFF3B82F6),      // blue-500
    "media" to Color(0xFFF59E0B),     // yellow-500
    "alta" to Color(0xFFF97316),      // orange-500
    "critica" to Color(0xFFEF4444),   // red-500
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CreateNoteScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember { FieldNoteRepository(context) }
    val parcelRepository = remember { ParcelRepository(context) }

    var description by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("") }
    var selectedSeverity by remember { mutableStateOf("media") }
    var isSaving by remember { mutableStateOf(false) }

    // Photo state
    var photoUri by remember { mutableStateOf<Uri?>(null) }
    var tempPhotoUri by remember { mutableStateOf<Uri?>(null) }

    // Parcel state — offline-first from Room
    var selectedParcel by remember { mutableStateOf<ParcelEntity?>(null) }
    var parcelExpanded by remember { mutableStateOf(false) }
    val parcels by parcelRepository.getAllParcels().collectAsState(initial = emptyList())
    var syncStatus by remember { mutableStateOf("") }

    // ── GPS Location state ──
    var currentLocation by remember { mutableStateOf<Location?>(null) }
    var locationStatus by remember { mutableStateOf("Esperando permisos...") }
    var locationAccuracy by remember { mutableStateOf<Float?>(null) }
    val fusedLocationClient = remember {
        LocationServices.getFusedLocationProviderClient(context)
    }

    // Location callback
    val locationCallback = remember {
        object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc = result.lastLocation ?: return
                locationAccuracy = loc.accuracy
                if (loc.accuracy <= 5f) {
                    // GPS con precisión menor a 5m — aceptar
                    currentLocation = loc
                    locationStatus = "GPS listo (±${loc.accuracy.toInt()}m)"
                    // Stop updates once we have good accuracy
                    fusedLocationClient.removeLocationUpdates(this)
                } else {
                    locationStatus = "Mejorando precisión (±${loc.accuracy.toInt()}m)..."
                }
            }
        }
    }

    // Start GPS when location permission is granted
    @SuppressLint("MissingPermission")
    fun startGpsUpdates() {
        locationStatus = "Obteniendo ubicación..."
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
            .setMinUpdateIntervalMillis(500L)
            .setMaxUpdates(60) // max 60 updates (1 min)
            .build()
        fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
    }

    // Location permission launcher
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fine = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true
        if (fine) {
            startGpsUpdates()
        } else {
            locationStatus = "Permiso de ubicación denegado"
        }
    }

    // Request location permission on screen open
    LaunchedEffect(Unit) {
        val hasFine = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (hasFine) {
            startGpsUpdates()
        } else {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                )
            )
        }
    }

    // Stop location updates when leaving screen
    DisposableEffect(Unit) {
        onDispose {
            fusedLocationClient.removeLocationUpdates(locationCallback)
        }
    }

    // Sync parcels from server (background, non-blocking)
    LaunchedEffect(Unit) {
        syncStatus = "Sincronizando..."
        val updated = parcelRepository.syncFromServer()
        syncStatus = if (updated) "Actualizado" else ""
    }

    // Camera launcher
    var lastPhotoRealPath by remember { mutableStateOf<String?>(null) }

    fun createImageFile(): Pair<Uri, String> {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val imageFileName = "AGRA_${timeStamp}_"
        val storageDir = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES)
        val imageFile = File.createTempFile(imageFileName, ".jpg", storageDir)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", imageFile)
        return Pair(uri, imageFile.absolutePath)
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success) {
            photoUri = tempPhotoUri
        }
    }



    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val (uri, realPath) = createImageFile()
            tempPhotoUri = uri
            lastPhotoRealPath = realPath
            cameraLauncher.launch(uri)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        AgraGreenSurface,
                        AgraEmerald50,
                        AgraTeal50,
                    ),
                    start = Offset(0f, 0f),
                    end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY),
                )
            ),
    ) {
        Column(Modifier.fillMaxSize()) {
            // ── Top App Bar with glassmorphism ──
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(
                        elevation = 2.dp,
                        shape = RoundedCornerShape(0.dp),
                        ambientColor = Color.Black.copy(alpha = 0.04f),
                    )
                    .background(Color.White.copy(alpha = 0.88f))
                    .statusBarsPadding()
                    .padding(horizontal = 4.dp, vertical = 4.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            "Volver",
                            tint = TextPrimary,
                        )
                    }
                    Text(
                        "Nueva Observación",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = TextPrimary,
                    )
                }
            }

            // ── Content ──
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Spacer(Modifier.height(12.dp))

                // ── Parcel selector ──
                SectionLabel(
                    label = "Parcela",
                    trailing = if (parcels.isNotEmpty()) "${parcels.size} disponibles" else null,
                )
                Spacer(Modifier.height(8.dp))

                if (parcels.isEmpty()) {
                    // Empty state — no cached parcels
                    GlassCard(Modifier.fillMaxWidth(), cornerRadius = 14.dp, elevation = 2.dp) {
                        Row(
                            Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (syncStatus == "Sincronizando...") {
                                CircularProgressIndicator(
                                    Modifier.size(18.dp),
                                    color = AgraGreen,
                                    strokeWidth = 2.dp,
                                )
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    "Descargando parcelas...",
                                    fontSize = 13.sp,
                                    color = TextSecondary,
                                )
                            } else {
                                Icon(
                                    Icons.Default.CloudOff,
                                    null,
                                    tint = SeverityMedium,
                                    modifier = Modifier.size(20.dp),
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    "Conéctate a internet para descargar parcelas",
                                    fontSize = 12.sp,
                                    color = TextSecondary,
                                )
                            }
                        }
                    }
                } else {
                    // Parcel dropdown
                    Box(modifier = Modifier.fillMaxWidth()) {
                        OutlinedTextField(
                            value = selectedParcel?.let { "${it.code} — ${it.name}" } ?: "",
                            onValueChange = {},
                            readOnly = true,
                            placeholder = {
                                Text(
                                    "Selecciona una parcela...",
                                    color = TextTertiary,
                                )
                            },
                            leadingIcon = {
                                Icon(
                                    Icons.Default.Map,
                                    null,
                                    tint = AgraGreen.copy(alpha = 0.5f),
                                )
                            },
                            trailingIcon = {
                                IconButton(onClick = { parcelExpanded = !parcelExpanded }) {
                                    Icon(
                                        if (parcelExpanded) Icons.Default.ArrowDropUp
                                        else Icons.Default.ArrowDropDown,
                                        null,
                                        tint = TextSecondary,
                                    )
                                }
                            },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = AgraGreen,
                                unfocusedBorderColor = CardBorder.copy(alpha = 0.5f),
                                cursorColor = AgraGreen,
                                focusedTextColor = TextPrimary,
                                unfocusedTextColor = TextPrimary,
                            ),
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { parcelExpanded = true },
                        )
                        DropdownMenu(
                            expanded = parcelExpanded,
                            onDismissRequest = { parcelExpanded = false },
                            modifier = Modifier
                                .fillMaxWidth(0.9f)
                                .background(Color.White),
                        ) {
                            parcels.forEach { parcel ->
                                DropdownMenuItem(
                                    text = {
                                        Column {
                                            Text(parcel.name, color = TextPrimary, fontSize = 14.sp)
                                            Text(
                                                parcel.code,
                                                color = TextTertiary,
                                                fontSize = 11.sp,
                                            )
                                        }
                                    },
                                    leadingIcon = {
                                        Icon(
                                            Icons.Default.Landscape,
                                            null,
                                            tint = if (selectedParcel?.serverId == parcel.serverId)
                                                AgraGreen
                                            else
                                                AgraGreen.copy(alpha = 0.3f),
                                        )
                                    },
                                    onClick = {
                                        selectedParcel = parcel
                                        parcelExpanded = false
                                    },
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(24.dp))

                // ── Category selector ──
                SectionLabel(label = "Categoría")
                Spacer(Modifier.height(10.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    categories.forEach { cat ->
                        val selected = selectedCategory == cat.key
                        FilterChip(
                            selected = selected,
                            onClick = { selectedCategory = cat.key },
                            label = {
                                Text(
                                    cat.label,
                                    fontSize = 12.sp,
                                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                                )
                            },
                            leadingIcon = {
                                Icon(cat.icon, null, Modifier.size(16.dp))
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = cat.color.copy(alpha = 0.12f),
                                selectedLabelColor = cat.color,
                                selectedLeadingIconColor = cat.color,
                                containerColor = Color.White.copy(alpha = 0.7f),
                                labelColor = TextSecondary,
                                iconColor = TextTertiary,
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled = true,
                                selected = selected,
                                borderColor = if (selected) cat.color.copy(alpha = 0.3f) else CardBorder.copy(alpha = 0.5f),
                                selectedBorderColor = cat.color.copy(alpha = 0.3f),
                            ),
                            shape = RoundedCornerShape(12.dp),
                        )
                    }
                }

                Spacer(Modifier.height(24.dp))

                // ── Severity selector ──
                SectionLabel(label = "Prioridad")
                Spacer(Modifier.height(10.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    severities.forEach { (key, color) ->
                        val selected = selectedSeverity == key
                        val dotColor = severityDots[key] ?: color
                        FilterChip(
                            selected = selected,
                            onClick = { selectedSeverity = key },
                            label = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        Modifier
                                            .size(6.dp)
                                            .clip(RoundedCornerShape(50))
                                            .background(dotColor)
                                    )
                                    Spacer(Modifier.width(5.dp))
                                    Text(
                                        key.replaceFirstChar { c -> c.uppercase() },
                                        fontSize = 12.sp,
                                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                                    )
                                }
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = dotColor.copy(alpha = 0.1f),
                                selectedLabelColor = dotColor,
                                containerColor = Color.White.copy(alpha = 0.7f),
                                labelColor = TextSecondary,
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled = true,
                                selected = selected,
                                borderColor = CardBorder.copy(alpha = 0.5f),
                                selectedBorderColor = dotColor.copy(alpha = 0.3f),
                            ),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                Spacer(Modifier.height(24.dp))

                // ── Description ──
                SectionLabel(label = "Descripción *")
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    placeholder = {
                        Text(
                            "Describe lo que observas en campo...",
                            color = TextTertiary,
                        )
                    },
                    minLines = 4,
                    maxLines = 8,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AgraGreen,
                        unfocusedBorderColor = CardBorder.copy(alpha = 0.5f),
                        cursorColor = AgraGreen,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary,
                    ),
                    shape = RoundedCornerShape(14.dp),
                )

                Spacer(Modifier.height(24.dp))

                // ── Photo section ──
                SectionLabel(label = "Foto de la observación")
                Spacer(Modifier.height(10.dp))

                if (photoUri != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .border(
                                1.dp,
                                AgraGreen.copy(alpha = 0.3f),
                                RoundedCornerShape(16.dp),
                            ),
                    ) {
                        AsyncImage(
                            model = photoUri,
                            contentDescription = "Foto capturada",
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop,
                        )
                        IconButton(
                            onClick = { photoUri = null },
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(6.dp),
                        ) {
                            Icon(
                                Icons.Default.Close,
                                "Eliminar foto",
                                tint = Color.White,
                                modifier = Modifier
                                    .background(
                                        Color(0xFFEF4444),
                                        RoundedCornerShape(50),
                                    )
                                    .padding(4.dp),
                            )
                        }
                    }
                } else {
                    // Camera only — field photos must be taken on-site
                    PhotoOptionCard(
                        icon = Icons.Default.CameraAlt,
                        label = "Tomar Foto",
                        sublabel = "Captura la observación con la cámara",
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            val hasPerm = ContextCompat.checkSelfPermission(
                                context,
                                Manifest.permission.CAMERA,
                            ) == PackageManager.PERMISSION_GRANTED
                            if (hasPerm) {
                                try {
                                    val (uri, realPath) = createImageFile()
                                    tempPhotoUri = uri
                                    lastPhotoRealPath = realPath
                                    cameraLauncher.launch(uri)
                                } catch (e: Exception) {
                                    Log.e("CreateNote", "Error al abrir cámara", e)
                                    Toast.makeText(context, "Error al abrir cámara: ${e.message}", Toast.LENGTH_LONG).show()
                                }
                            } else {
                                permissionLauncher.launch(Manifest.permission.CAMERA)
                            }
                        },
                    )
                }

                Spacer(Modifier.height(14.dp))

                // GPS status chip — live accuracy indicator
                val gpsReady = currentLocation != null
                val gpsColor = when {
                    gpsReady -> AgraGreen
                    locationAccuracy != null -> SeverityMedium
                    else -> TextTertiary
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            if (gpsReady) AgraGreen.copy(alpha = 0.08f)
                            else AgraGreenSurface.copy(alpha = 0.5f)
                        )
                        .border(
                            0.5.dp,
                            gpsColor.copy(alpha = 0.2f),
                            RoundedCornerShape(12.dp),
                        )
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (!gpsReady && locationAccuracy != null) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = gpsColor,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(
                            if (gpsReady) Icons.Default.GpsFixed else Icons.Default.GpsNotFixed,
                            null,
                            tint = gpsColor,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(
                            locationStatus,
                            fontSize = 12.sp,
                            color = if (gpsReady) AgraGreen else TextSecondary,
                            fontWeight = FontWeight.Medium,
                        )
                        if (currentLocation != null) {
                            Text(
                                "${String.format("%.6f", currentLocation!!.latitude)}, ${String.format("%.6f", currentLocation!!.longitude)}",
                                fontSize = 10.sp,
                                color = TextTertiary,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(32.dp))

                // ── Save button ──
                val canSave = description.isNotBlank()
                        && selectedCategory.isNotBlank()
                        && selectedParcel != null
                        && currentLocation != null
                        && !isSaving

                Button(
                    onClick = {
                        isSaving = true
                        scope.launch {
                            val note = repository.createNote(
                                description = description,
                                category = selectedCategory,
                                severity = selectedSeverity,
                                parcelId = selectedParcel?.serverId,
                                latitude = currentLocation?.latitude,
                                longitude = currentLocation?.longitude,
                                photoUri = lastPhotoRealPath,
                            )
                            // Intentar subir nota+foto INMEDIATAMENTE
                            val uploaded = repository.uploadNoteAndPhotoNow(note.folio)
                            if (!uploaded) {
                                // Si falló, el SyncWorker lo reintentará
                                SyncWorker.enqueueImmediateSync(context)
                            }
                            isSaving = false
                            onBack()
                        }
                    },
                    enabled = canSave,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.Transparent,
                        disabledContainerColor = Color.Transparent,
                    ),
                    contentPadding = PaddingValues(0.dp),
                    elevation = ButtonDefaults.buttonElevation(
                        defaultElevation = if (canSave) 6.dp else 0.dp,
                        pressedElevation = 2.dp,
                    ),
                ) {
                    Box(
                        Modifier
                            .fillMaxSize()
                            .background(
                                brush = Brush.horizontalGradient(
                                    colors = if (canSave) listOf(AgraGreen, AgraEmerald600)
                                    else listOf(LightBg3, LightBg3),
                                ),
                                shape = RoundedCornerShape(14.dp),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (isSaving) {
                            CircularProgressIndicator(
                                Modifier.size(22.dp),
                                color = Color.White,
                                strokeWidth = 2.dp,
                            )
                        } else {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.Save,
                                    null,
                                    tint = if (canSave) Color.White else TextTertiary,
                                    modifier = Modifier.size(20.dp),
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    "Guardar Nota",
                                    color = if (canSave) Color.White else TextTertiary,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 15.sp,
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

/**
 * Section label — matches frontend's `text-xs font-semibold text-gray-500 uppercase tracking-wider`
 */
@Composable
private fun SectionLabel(
    label: String,
    trailing: String? = null,
) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label.uppercase(),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = TextTertiary,
            letterSpacing = 1.sp,
        )
        if (trailing != null) {
            Text(
                text = trailing,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = AgraGreen,
            )
        }
    }
}

/**
 * Photo option card with icon, label, and sublabel.
 * Styled as a dashed-border area matching the frontend's photo capture pattern.
 */
@Composable
private fun PhotoOptionCard(
    icon: ImageVector,
    label: String,
    sublabel: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .border(
                width = 1.5.dp,
                color = AgraGreen.copy(alpha = 0.25f),
                shape = RoundedCornerShape(16.dp),
            )
            .background(Color.White.copy(alpha = 0.6f))
            .clickable(onClick = onClick)
            .padding(vertical = 20.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            icon,
            null,
            tint = AgraGreen,
            modifier = Modifier.size(32.dp),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            label,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = TextPrimary,
        )
        Text(
            sublabel,
            fontSize = 11.sp,
            color = TextTertiary,
        )
    }
}
