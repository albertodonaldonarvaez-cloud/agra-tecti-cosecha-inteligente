package com.agratec.fieldapp.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Environment
import android.util.Log
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
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

data class CategoryOption(val key: String, val label: String, val icon: ImageVector, val color: Color)

private val categories = listOf(
    CategoryOption("plaga_enfermedad", "Plaga/Enfermedad", Icons.Default.BugReport, SeverityCritical),
    CategoryOption("riego_drenaje", "Riego/Drenaje", Icons.Default.Water, Color(0xFF3B82F6)),
    CategoryOption("arboles_mal_plantados", "Árboles", Icons.Default.Forest, AgraGreen),
    CategoryOption("dano_mecanico", "Daño Mecánico", Icons.Default.Warning, SeverityHigh),
    CategoryOption("maleza", "Maleza", Icons.Default.Grass, AgraGreenLight),
    CategoryOption("fertilizacion", "Fertilización", Icons.Default.Science, Color(0xFF8B5CF6)),
    CategoryOption("suelo", "Suelo", Icons.Default.Terrain, Color(0xFF92400E)),
    CategoryOption("infraestructura", "Infraestructura", Icons.Default.Construction, Color(0xFF64748B)),
    CategoryOption("fauna", "Fauna", Icons.Default.Pets, Color(0xFFF59E0B)),
    CategoryOption("otro", "Otro", Icons.Default.Notes, Color(0xFF94A3B8)),
)

private val severities = listOf(
    "baja" to SeverityLow,
    "media" to SeverityMedium,
    "alta" to SeverityHigh,
    "critica" to SeverityCritical,
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

    // Sync parcels from server (background, non-blocking)
    LaunchedEffect(Unit) {
        syncStatus = "Sincronizando..."
        val updated = parcelRepository.syncFromServer()
        syncStatus = if (updated) "Actualizado" else ""
    }

    // Camera launcher
    fun createImageFile(): Uri {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val imageFileName = "AGRA_${timeStamp}_"
        val storageDir = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES)
        val imageFile = File.createTempFile(imageFileName, ".jpg", storageDir)
        return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", imageFile)
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success) {
            photoUri = tempPhotoUri
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        uri?.let { photoUri = it }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val uri = createImageFile()
            tempPhotoUri = uri
            cameraLauncher.launch(uri)
        }
    }

    Scaffold(
        containerColor = LightBg1,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Nueva Nota de Campo",
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver", tint = TextPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White.copy(alpha = 0.9f),
                ),
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            Spacer(Modifier.height(8.dp))

            // ── Parcel selector ──
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Parcela",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextSecondary,
                )
                if (parcels.isNotEmpty()) {
                    Text(
                        "${parcels.size} disponibles",
                        fontSize = 11.sp,
                        color = AgraGreen,
                    )
                }
            }
            Spacer(Modifier.height(8.dp))

            if (parcels.isEmpty()) {
                // Empty state — no cached parcels
                GlassCard(Modifier.fillMaxWidth(), cornerRadius = 14.dp) {
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
                                tint = AgraGreen.copy(alpha = 0.6f),
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
                            unfocusedBorderColor = CardBorder,
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

            Spacer(Modifier.height(20.dp))

            // ── Category selector ──
            Text(
                "Categoría",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextSecondary,
            )
            Spacer(Modifier.height(8.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                categories.forEach { cat ->
                    val selected = selectedCategory == cat.key
                    FilterChip(
                        selected = selected,
                        onClick = { selectedCategory = cat.key },
                        label = { Text(cat.label, fontSize = 12.sp) },
                        leadingIcon = {
                            Icon(cat.icon, null, Modifier.size(16.dp))
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = cat.color.copy(alpha = 0.12f),
                            selectedLabelColor = cat.color,
                            selectedLeadingIconColor = cat.color,
                            containerColor = Color.White,
                            labelColor = TextSecondary,
                            iconColor = TextTertiary,
                        ),
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            // ── Severity selector ──
            Text(
                "Severidad",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextSecondary,
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                severities.forEach { (key, color) ->
                    val selected = selectedSeverity == key
                    FilterChip(
                        selected = selected,
                        onClick = { selectedSeverity = key },
                        label = {
                            Text(
                                key.replaceFirstChar { c -> c.uppercase() },
                                fontSize = 12.sp,
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = color.copy(alpha = 0.12f),
                            selectedLabelColor = color,
                            containerColor = Color.White,
                            labelColor = TextSecondary,
                        ),
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            // ── Description ──
            Text(
                "Descripción",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextSecondary,
            )
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
                    unfocusedBorderColor = CardBorder,
                    cursorColor = AgraGreen,
                    focusedTextColor = TextPrimary,
                    unfocusedTextColor = TextPrimary,
                ),
                shape = RoundedCornerShape(14.dp),
            )

            Spacer(Modifier.height(20.dp))

            // ── Photo section ──
            Text(
                "Foto",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextSecondary,
            )
            Spacer(Modifier.height(8.dp))

            if (photoUri != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .border(
                            1.dp,
                            AgraGreen.copy(alpha = 0.3f),
                            RoundedCornerShape(14.dp),
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
                            .padding(4.dp),
                    ) {
                        Icon(
                            Icons.Default.Close,
                            "Eliminar foto",
                            tint = Color.White,
                            modifier = Modifier
                                .background(
                                    Color.Black.copy(alpha = 0.5f),
                                    RoundedCornerShape(50),
                                )
                                .padding(4.dp),
                        )
                    }
                }
            } else {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    GlassCard(
                        modifier = Modifier
                            .weight(1f)
                            .clickable {
                                val hasPerm = ContextCompat.checkSelfPermission(
                                    context,
                                    Manifest.permission.CAMERA,
                                ) == PackageManager.PERMISSION_GRANTED
                                if (hasPerm) {
                                    val uri = createImageFile()
                                    tempPhotoUri = uri
                                    cameraLauncher.launch(uri)
                                } else {
                                    permissionLauncher.launch(Manifest.permission.CAMERA)
                                }
                            },
                        cornerRadius = 14.dp,
                    ) {
                        Column(
                            Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                Icons.Default.CameraAlt,
                                null,
                                tint = AgraGreen,
                                modifier = Modifier.size(32.dp),
                            )
                            Spacer(Modifier.height(6.dp))
                            Text("Cámara", fontSize = 12.sp, color = TextSecondary)
                        }
                    }

                    GlassCard(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { galleryLauncher.launch("image/*") },
                        cornerRadius = 14.dp,
                    ) {
                        Column(
                            Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                Icons.Default.PhotoLibrary,
                                null,
                                tint = AgraGreen,
                                modifier = Modifier.size(32.dp),
                            )
                            Spacer(Modifier.height(6.dp))
                            Text("Galería", fontSize = 12.sp, color = TextSecondary)
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            GlassCard(Modifier.fillMaxWidth(), cornerRadius = 12.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.LocationOn,
                        null,
                        tint = AgraGreen.copy(alpha = 0.5f),
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "GPS se capturará automáticamente al guardar",
                        fontSize = 12.sp,
                        color = TextTertiary,
                    )
                }
            }

            Spacer(Modifier.height(32.dp))

            val canSave = description.isNotBlank()
                    && selectedCategory.isNotBlank()
                    && selectedParcel != null
                    && !isSaving

            Button(
                onClick = {
                    isSaving = true
                    scope.launch {
                        repository.createNote(
                            description = description,
                            category = selectedCategory,
                            severity = selectedSeverity,
                            parcelId = selectedParcel?.serverId,
                            photoUri = photoUri?.toString(),
                        )
                        SyncWorker.enqueueImmediateSync(context)
                        isSaving = false
                        onBack()
                    }
                },
                enabled = canSave,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.Transparent,
                    disabledContainerColor = Color.Transparent,
                ),
                contentPadding = PaddingValues(0.dp),
            ) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(
                            brush = Brush.horizontalGradient(
                                colors = if (canSave) listOf(AgraGreen, AgraGreenLight)
                                else listOf(LightBg3, LightBg3),
                            ),
                            shape = RoundedCornerShape(14.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(
                            Modifier.size(24.dp),
                            color = Color.White,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Save,
                                null,
                                tint = if (canSave) Color.White else TextTertiary,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "Guardar Nota",
                                color = if (canSave) Color.White else TextTertiary,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}
