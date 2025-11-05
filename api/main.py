from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from io import BytesIO
import os

app = FastAPI()

# Allow frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# SQLite DB (file will be created)
import tempfile
DB_PATH = tempfile.gettempdir() + "/imported_data.db"
engine = create_engine(f"sqlite:///{DB_PATH}")

# Your dataset configs
DATASETS = {
    'Valuations': {
        'sheets': [{
            'sheet_name': 0,
            'table_name': 'valuations',
            'columns': {'date': 'datetime', 'asset': 'str', 'value': 'float'},
            'required_cols': ['date', 'asset', 'value'],
            'numeric_cols': ['value']
        }]
    },
    'Risk': {
        'sheets': [{
            'sheet_name': 0,
            'table_name': 'risk',
            'columns': {'date': 'datetime', 'risk_factor': 'str', 'exposure': 'float'},
            'required_cols': ['date', 'risk_factor', 'exposure'],
            'numeric_cols': ['exposure']
        }]
    },
    'P&L': {
        'sheets': [
            {
                'sheet_name': 'Actuals',
                'table_name': 'pnl_actuals',
                'columns': {'date': 'datetime', 'account': 'str', 'profit_loss': 'float'},
                'required_cols': ['date', 'account', 'profit_loss'],
                'numeric_cols': ['profit_loss']
            },
            {
                'sheet_name': 'KPIs',
                'table_name': 'pnl_kpis',
                'columns': {'date': 'datetime', 'kpi_type': 'str', 'kpi_name': 'str', 'kpi_value': 'float'},
                'required_cols': ['date', 'kpi_type', 'kpi_name', 'kpi_value'],
                'numeric_cols': ['kpi_value']
            }
        ]
    }
}

# Create tables
def create_tables():
    for dataset, info in DATASETS.items():
        for sheet in info['sheets']:
            table = sheet['table_name']
            cols = ', '.join([f"{col} {dtype.upper() if dtype != 'datetime' else 'DATE'}"
                            for col, dtype in sheet['columns'].items()])
            query = f"CREATE TABLE IF NOT EXISTS {table} (id INTEGER PRIMARY KEY AUTOINCREMENT, {cols})"
            with engine.connect() as conn:
                conn.execute(text(query))

create_tables()

def validate_data(df, config):
    check_results = {}
    error_locations = []

    # Required columns
    missing = set(config['required_cols']) - set(df.columns)
    if missing:
        check_results['Columns'] = {'passed': False, 'msg': f"Missing: {', '.join(missing)}"}
    else:
        check_results['Columns'] = {'passed': True, 'msg': "All required"}

    # Data types (add similar dict structure)
    type_errors = False
    for col, dtype in config['columns'].items():
        if col in df.columns:
            if dtype == 'datetime':
                df[col] = pd.to_datetime(df[col], errors='coerce')
            elif dtype == 'float':
                df[col] = pd.to_numeric(df[col], errors='coerce')
            invalid = df[df[col].isnull()].index.tolist()
            if invalid:
                error_locations.extend([(i, col) for i in invalid])
                type_errors = True

    if type_errors:
        check_results['Data Types'] = {'passed': False, 'msg': "Invalid data types found"}
    else:
        check_results['Data Types'] = {'passed': True, 'msg': "All data types valid"}

    # Missing values
    missing_vals = False
    for col in config['required_cols']:
        invalid = df[df[col].isnull()].index.tolist()
        if invalid:
            error_locations.extend([(i, col) for i in invalid])
            missing_vals = True

    if missing_vals:
        check_results['Missing Values'] = {'passed': False, 'msg': "Missing values in required columns"}
    else:
        check_results['Missing Values'] = {'passed': True, 'msg': "No missing values"}

    # Checksum
    checksum_passed = True
    if config['numeric_cols']:
        df['checksum'] = df[config['numeric_cols']].sum(axis=1)
        bad = df[df['checksum'] <= 0].index.tolist()
        if bad:
            for i in bad:
                for col in config['numeric_cols']:
                    error_locations.append((i, col))
            checksum_passed = False
        df.drop('checksum', axis=1, inplace=True)

    check_results['Checksum'] = {'passed': checksum_passed, 'msg': "All checksums valid" if checksum_passed else "Invalid checksums found"}

    all_passed = all(check['passed'] for check in check_results.values())
    return df, check_results, all_passed, error_locations

# Health check
@app.get("/health")
def health():
    return {"status": "ok"}

# Validate endpoint
@app.post("/validate/{dataset}")
async def validate(dataset: str, file: UploadFile = File(...)):
    if dataset not in DATASETS:
        raise HTTPException(400, "Invalid dataset")

    contents = await file.read()
    config = DATASETS[dataset]
    all_dfs = {}
    all_checks = {}
    all_errors = []
    all_locs = {}
    valid = True

    for sheet in config['sheets']:
        df = pd.read_excel(BytesIO(contents), sheet_name=sheet['sheet_name'])
        df_clean, checks, passed, locs = validate_data(df, sheet)
        table = sheet['table_name']
        all_dfs[table] = df_clean.to_dict(orient='records')
        all_checks[table] = checks
        all_locs[table] = locs
        if not passed:
            valid = False
        all_errors.extend([check['msg'] for check in checks.values() if not check['passed']])

    # ← CRITICAL FIX: Convert NaN → null so JSON can serialize
    for table_name, records in all_dfs.items():
        df = pd.DataFrame(records)
        df = df.replace({float('nan'): None, 'NaN': None})
        all_dfs[table_name] = df.to_dict(orient='records')
    # ← END FIX

    return {
        "valid": valid,
        "check_results": all_checks,
        "errors": all_errors,
        "previews": all_dfs,
        "error_locations": all_locs
    }

# Save endpoint
@app.post("/save/{dataset}")
async def save(dataset: str, data: dict):
    try:
        for table, rows in data.items():
            df = pd.DataFrame(rows)
            df.to_sql(table, engine, if_exists='append', index=False)
        return {"message": "Saved!"}
    except SQLAlchemyError as e:
        raise HTTPException(500, str(e))