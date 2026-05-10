import re

# Coast orientation mapping by spot ID
# 0=N, 90=E, 180=S, 270=W
COAST_ORIENTATIONS = {
    # Norte - Costa Oeste (virada para Oeste/Atlantico)
    'matosinhos': 270, 'ofir': 270, 'povoa-varzim': 270, 'cabedelo': 270,
    'esposende': 270, 'moledo': 270, 'afife': 270, 'vila-praia-ancora': 270,
    'castelo-neiva': 270, 'amorosa': 270, 'apulia': 270, 'fao': 270,
    'espinho': 270, 'esmoriz': 270, 'cortegaca': 270, 'azurara': 270,
    'leca-palmeira': 270, 'maceda': 270, 'sao-jacinto': 270,
    
    # Centro - Costa Oeste
    'ribeira-ilhas': 270, 'coxos': 270, 'foz-lizandro': 270,
    
    # Lisboa - Costa Oeste
    'baleal': 270, 'carcavelos': 270, 'costa-caparica': 270, 'fonte-telha': 270,
    'lagoa-albufeira': 270, 'costa-nova': 270, 'nazare': 270, 'supertubos': 270,
    'guincho': 270, 'cascais': 270, 'estoril': 270, 'cabo-ruvo': 270,
    'sao-pedro-estoril': 270, 'praia-grande-sintra': 270,
    
    # Alentejo - Costa Oeste
    'sines': 270, 'porto-covo': 270, 'zambujeira': 270, 'odeceixe': 270,
    'sao-torpes': 270, 'almoxarife': 270, 'arraiolos': 270,
    'zambujeira-secret': 270, 'odeceixe-secret': 270, 'sao-torpes-secret': 270,
    'porto-covo-secret': 270, 'moledo-secret': 270,
    
    # Algarve Oeste - Costa virada para Oeste/Sudoeste
    'arrifana': 270, 'bordeira': 270, 'carrapateira': 270, 'amado': 270,
    'beliche': 270, 'tonel': 270, 'martinhal': 270, 'sagres': 270,
    'burgau': 270, 'salema': 270, 'furnas': 270, 'figueira': 270,
    'odeceixe-secret': 270,
    
    # Algarve Sul - Costa virada para Sul
    'lagos': 180, 'dona-ana': 180, 'camilo': 180, 'batata': 180,
    'portimao': 180, 'praiarocha': 180, 'carvoeiro': 180, 'benagil': 180,
    'alvor': 180, 'meia-praia': 180, 'ferragudo': 180, 'tavira': 180,
    'olhao': 180, 'faro': 180, 'culatra': 180, 'manta-rota': 180,
    'monte-gordo': 180, 'vila-real-santo-antonio': 180,
    
    # Algarve Ria Formosa (costa virada para SE)
    'ilha-farol': 135, 'ilha-barreta': 135, 'ilha-armona': 135,
    'ilha-deserta': 135, 'quinta-lago': 180,
    
    # Açores - São Miguel (varia por spot)
    'populo': 180, 'milicias': 180, 'mosteiros': 270, 'povoacao': 90,
    'ribeira-quente': 90, 'faja': 90, 'caloura': 135,
    'santa-barbara': 0, 'nordeste': 0, 'areias': 0,
    'vila-franca-marina': 180,
    
    # Madeira - varia por costa
    'jardim-mar': 270, 'paul-mar': 270, 'porto-cruz': 90,
    'machico': 90, 'madalena': 90, 'canico': 135,
    'praia-formosa': 270, 'calheta': 270, 'porto-moniz': 270,
    
    # Secret spots - same as originals
    'jardim-mar-secret': 270, 'paul-mar-secret': 270,
}

# Default coast orientation: West (270°) for Portugal mainland Atlantic coast
DEFAULT_ORIENTATION = 270

# Read spots.ts
with open('src/lib/spots.ts', 'r') as f:
    content = f.read()

# Find each spot entry and add coastOrientation after the 'lon' field
# Pattern: id: '...', slug: '...', name: '...', nameEn: '...',
#          region: '...', regionEn: '...', lat: X, lon: Y,

# Split by spot entries
spot_pattern = r"(id:\s*'([^']+)'.*?slug:\s*'([^']+)'.*?regionEn:\s*'[^']+'\s*,\s*lat:\s*([-\d.]+)\s*,\s*lon:\s*([-\d.]+)\s*,)"

def replace_spot(match):
    spot_id = match.group(2)
    lat = float(match.group(4))
    lon = float(match.group(5))
    
    # Determine coast orientation
    orientation = COAST_ORIENTATIONS.get(spot_id, DEFAULT_ORIENTATION)
    
    # For Açores spots not in the map, try to infer from coordinates
    if spot_id not in COAST_ORIENTATIONS:
        if lat > 37.5 and lon < -25:  # Açores, São Miguel area
            if lon < -26:  # West side of island
                orientation = 270
            elif lon > -25.2:  # East side
                orientation = 90
            elif lat > 37.8:  # North side
                orientation = 0
            else:  # South side
                orientation = 180
        elif lat > 32 and lat < 33 and lon < -16:  # Madeira
            if lon < -17:  # West/South coast
                orientation = 270
            else:  # East/North coast
                orientation = 90
    
    return match.group(1) + f"\n    coastOrientation: {orientation},"

new_content = re.sub(spot_pattern, replace_spot, content, flags=re.DOTALL)

# Write back
with open('src/lib/spots.ts', 'w') as f:
    f.write(new_content)

# Count spots updated
spots_in_file = len(re.findall(r"id:\s*'([^']+)'", content))
print(f'✅ Updated {spots_in_file} spots with coastOrientation')
print(f'   Default: {DEFAULT_ORIENTATION}° (West)')
print(f'   Algarve Sul: 180° (South)')
print(f'   Madeira East: 90° (East)')
print(f'   Açores North: 0° (North)')
