package com.agratec.fieldapp.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Environment
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
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
import com.agratec.fieldapp.data.repository.FieldNoteRepository
import com.agratec.fieldapp.sync.SyncWorker
import com.agratec.fieldapp.ui.components.GlassCard
import com.agratec.fieldapp.ui.theme.*
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

data class CategoryOption(val key: String, val label: String, val icon: ImageVector, val color: Color)
data class ParcelOption(val id: Int, val name: String)

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

    var description by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("") }
    var selectedSeverity by remember { mutableStateOf("media") }
    var isSaving by remember { mutableStateOf(false) }

    // Photo state
    var photoUri by remember { mutableStateOf<Uri?>(null) }
    var tempPhotoUri by remember { mutableStateOf<Uri?>(null) }

    // Parcel state
    var selectedParcel by remember { mutableStateOf<ParcelOption?>(null) }
    var parcelExpanded by remember { mutableStateOf(false) }
    // TODO: Cargar parcelas desde Room/API via offlineSync.getParcels
    val parcels = remember {
        listOf(
            ParcelOption(1, "Parcela Norte - Higo"),
            ParcelOption(2, "Parcela Sur - Higo"),
            ParcelOption(3, "Parcela Este - Aguacate"),
            ParcelOption(4, "Parcela Oeste - Nuez"),
            ParcelOption(5, "Parcela Central - Manzana"),
        )
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

    // Gallery launcher
    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        uri?.let { photoUri = it }
    }

    // Permission launcher
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
        containerColor = DarkBg1,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Nueva Nota de Campo",
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Volver", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
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
            Text(
                "Parcela",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White.copy(alpha = 0.7f),
            )
            Spacer(Modifier.height(8.dp))
            ExposedDropdownMenuBox(
                expanded = parcelExpanded,
                onExpandedChange = { parcelExpanded = !parcelExpanded },
            ) {
                OutlinedTextField(
                    value = selectedParcel?.name ?: "",
                    onValueChange = {},
                    readOnly = true,
                    placeholder = {
                        Text(
                            "Selecciona una parcela...",
                            color = Color.White.copy(alpha = 0.3f),
                        )
                    },
                    leadingIcon = {
                        Icon(
                            Icons.Default.Map,
                            null,
                            tint = AgraGreenLight.copy(alpha = 0.6f),
                        )
                    },
                    trailingIcon = {
                        ExposedDropdownMenuDefaults.TrailingIcon(expanded = parcelExpanded)
                    },
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AgraGreen,
                        unfocusedBorderColor = Color.White.copy(alpha = 0.15f),
                        cursorColor = AgraGreenLight,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White.copy(alpha = 0.8f),
                    ),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                )
                ExposedDropdownMenu(
                    expanded = parcelExpanded,
                    onDismissRequest = { parcelExpanded = false },
                    containerColor = DarkBg3,
                ) {
                    parcels.forEach { parcel ->
                        DropdownMenuItem(
                            text = {
                                Text(parcel.name, color = Color.White)
                            },
                            leadingIcon = {
                                Icon(
                                    Icons.Default.Landscape,
                                    null,
                                    tint = AgraGreenLight.copy(alpha = 0.5f),
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

            Spacer(Modifier.height(20.dp))

            // ── Category selector ──
            Text(
                "Categoría",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White.copy(alpha = 0.7f),
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
                            selectedContainerColor = cat.color.copy(alpha = 0.2f),
                            selectedLabelColor = cat.color,
                            selectedLeadingIconColor = cat.color,
                            containerColor = DarkBg3,
                            labelColor = Color.White.copy(alpha = 0.6f),
                            iconColor = Color.White.copy(alpha = 0.4f),
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            borderColor = Color.White.copy(alpha = 0.1f),
                            selectedBorderColor = cat.color.copy(alpha = 0.4f),
                            enabled = true,
                            selected = selected,
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
                color = Color.White.copy(alpha = 0.7f),
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
                                key.replaceFirstChar { it.uppercase() },
                                fontSize = 12.sp,
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = color.copy(alpha = 0.2f),
                            selectedLabelColor = color,
                            containerColor = DarkBg3,
                            labelColor = Color.White.copy(alpha = 0.6f),
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            borderColor = Color.White.copy(alpha = 0.1f),
                            selectedBorderColor = color.copy(alpha = 0.4f),
                            enabled = true,
                            selected = selected,
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
                color = Color.White.copy(alpha = 0.7f),
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                placeholder = {
                    Text(
                        "Describe lo que observas en campo...",
                        color = Color.White.copy(alpha = 0.3f),
                    )
                },
                minLines = 4,
                maxLines = 8,
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = AgraGreen,
                    unfocusedBorderColor = Color.White.copy(alpha = 0.15f),
                    cursorColor = AgraGreenLight,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White.copy(alpha = 0.8f),
                ),
                shape = RoundedCornerShape(14.dp),
            )

            Spacer(Modifier.height(20.dp))

            // ── Photo section ──
            Text(
                "Foto",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White.copy(alpha = 0.7f),
            )
            Spacer(Modifier.height(8.dp))

            if (photoUri != null) {
                // Photo preview
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
                    // Delete button
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
                // Camera / Gallery buttons
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    // Camera button
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
                                    permissionLauncher.launch(
                                        Manifest.permission.CAMERA,
                                    )
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
                                tint = AgraGreenLight,
                                modifier = Modifier.size(32.dp),
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Cámara",
                                fontSize = 12.sp,
                                color = Color.White.copy(alpha = 0.7f),
                            )
                        }
                    }

                    // Gallery button
                    GlassCard(
                        modifier = Modifier
                            .weight(1f)
                            .clickable {
                                galleryLauncher.launch("image/*")
                            },
                        cornerRadius = 14.dp,
                    ) {
                        Column(
                            Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                Icons.Default.PhotoLibrary,
                                null,
                                tint = AgraGreenLight,
                                modifier = Modifier.size(32.dp),
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Galería",
                                fontSize = 12.sp,
                                color = Color.White.copy(alpha = 0.7f),
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            // GPS info
            GlassCard(Modifier.fillMaxWidth(), cornerRadius = 12.dp) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.LocationOn,
                        null,
                        tint = AgraGreenLight.copy(alpha = 0.5f),
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "GPS se capturará automáticamente al guardar",
                        fontSize = 12.sp,
                        color = Color.White.copy(alpha = 0.4f),
                    )
                }
            }

            Spacer(Modifier.height(32.dp))

            // ── Save button ──
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
                            parcelId = selectedParcel?.id,
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
                                else listOf(DarkBg3, DarkBg3),
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
                                tint = if (canSave) Color.White
                                else Color.White.copy(alpha = 0.3f),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "Guardar Nota",
                                color = if (canSave) Color.White
                                else Color.White.copy(alpha = 0.3f),
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
