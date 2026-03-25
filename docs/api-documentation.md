# PACS API Documentation

Complete API reference for the PACS system including JWT authentication and Orthanc REST endpoints.

**Base URLs:**
- Auth Service: `http://localhost:8000`
- Orthanc REST API: `http://localhost:8042` (internal) or `https://localhost/orthanc` (through nginx)
- DICOMweb: `http://localhost:8042/dicom-web` (internal) or `https://localhost/orthanc/dicom-web` (through nginx)

---

## Table of Contents

1. [Authentication Service API](#authentication-service-api)
2. [Orthanc REST API](#orthanc-rest-api)
3. [DICOMweb API](#dicomweb-api)
4. [Error Codes](#error-codes)
5. [Rate Limiting](#rate-limiting)
6. [Examples](#examples)

---

## Authentication Service API

### Overview

The authentication service provides JWT-based authentication for the PACS system. All endpoints return JSON.

**Authentication:** Bearer token (except `/auth/register`, `/auth/login`, `/auth/validate`)

### Base URL
```
http://localhost:8000
```

### Endpoints

#### 1. Health Check

Check if the auth service is running.

```http
GET /
```

**Response:** `200 OK`
```json
{
  "status": "ok",
  "service": "pacs-auth-service"
}
```

---

#### 2. Register User

Register a new user account.

```http
POST /auth/register
Content-Type: application/json
```

**Request Body:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "secure_password",
  "role": "viewer"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| username | string | Yes | Unique username (min 3 chars) |
| email | string | Yes | Unique email address |
| password | string | Yes | Password (min 8 chars) |
| role | string | No | Role: `admin`, `radiologist`, `viewer` (default: `viewer`) |

**Response:** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "johndoe",
  "email": "john@example.com",
  "role": "viewer",
  "is_active": true,
  "created_at": "2026-03-24T14:30:00.000Z"
}
```

**Error Responses:**

- `400 Bad Request` - Validation error or user already exists
```json
{
  "error": "Username or email already exists"
}
```

---

#### 3. Login

Authenticate and receive JWT tokens.

```http
POST /auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "username": "johndoe",
  "password": "secure_password"
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 900
}
```

| Field | Type | Description |
|-------|------|-------------|
| access_token | string | JWT access token (valid for 15 minutes) |
| refresh_token | string | JWT refresh token (valid for 7 days) |
| token_type | string | Token type (always "bearer") |
| expires_in | number | Access token lifetime in seconds |

**Error Responses:**

- `401 Unauthorized` - Invalid credentials
```json
{
  "error": "Invalid credentials"
}
```

- `403 Forbidden` - User account inactive
```json
{
  "error": "User account is inactive"
}
```

---

#### 4. Refresh Token

Get a new access token using a refresh token.

```http
POST /auth/refresh
Content-Type: application/json
```

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:** `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 900
}
```

**Note:** The old refresh token is revoked when a new one is issued.

**Error Responses:**

- `401 Unauthorized` - Invalid or expired refresh token
```json
{
  "error": "Refresh token expired or invalid"
}
```

---

#### 5. Validate Token

Validate a JWT token (called by Orthanc Authorization Plugin).

```http
POST /auth/validate
Authorization: Bearer <access_token>
```

**Response:** `200 OK`
```json
{
  "granted": true,
  "validity": 60
}
```

| Field | Type | Description |
|-------|------|-------------|
| granted | boolean | Whether the token is valid |
| validity | number | Token validity cache duration in seconds |

**Error Responses:**

- `200 OK` with `granted: false` - Invalid token
```json
{
  "granted": false
}
```

---

#### 6. Get Current User

Get information about the authenticated user.

```http
GET /auth/me
Authorization: Bearer <access_token>
```

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "johndoe",
  "email": "john@example.com",
  "role": "radiologist",
  "is_active": true,
  "created_at": "2026-03-24T14:30:00.000Z",
  "last_login": "2026-03-24T15:45:00.000Z"
}
```

**Error Responses:**

- `401 Unauthorized` - Invalid or missing token
```json
{
  "error": "No token provided"
}
```

---

#### 7. Logout

Revoke a refresh token (logout).

```http
POST /auth/logout
Content-Type: application/json
```

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:** `200 OK`
```json
{
  "message": "Successfully logged out"
}
```

---

## Orthanc REST API

### Overview

Orthanc provides a comprehensive REST API for managing DICOM data. All endpoints require authentication (either basic auth or JWT token).

### Base URLs
```
Internal: http://localhost:8042
Through nginx: https://localhost/orthanc
```

### Authentication

**Option 1: Basic Auth** (during transition)
```http
Authorization: Basic base64(username:password)
```

**Option 2: JWT Bearer Token** (recommended)
```http
Authorization: Bearer <access_token>
```

### System Endpoints

#### 1. System Information

Get Orthanc system information.

```http
GET /system
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "Version": "1.12.3",
  "DatabaseVersion": 6,
  "DicomAet": "ORTHANC",
  "DicomPort": 4242,
  "HttpPort": 8042,
  "Name": "OrthancDev",
  "StorageCapacity": 0,
  "StorageUsed": 1073741824
}
```

---

#### 2. Get Statistics

Get system statistics.

```http
GET /statistics
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "CountPatients": 10,
  "CountStudies": 25,
  "CountSeries": 100,
  "CountInstances": 5000,
  "TotalDiskSize": 1073741824,
  "TotalUncompressedSize": 2147483648
}
```

---

#### 3. List Plugins

Get loaded plugins.

```http
GET /plugins
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
[
  "dicom-web",
  "gdcm",
  "postgresql-index",
  "delayed-deletion",
  "orthanc-explorer-2"
]
```

---

### Patient Endpoints

#### 1. List All Patients

```http
GET /patients
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (int) - Max number of results
- `offset` (int) - Offset for pagination
- `expand` (bool) - Include full patient details

**Response:** `200 OK`
```json
[
  "550e8400-e29b-41d4-a716-446655440000",
  "660e8400-e29b-41d4-a716-446655440001"
]
```

---

#### 2. Get Patient Details

```http
GET /patients/{id}
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "ID": "550e8400-e29b-41d4-a716-446655440000",
  "MainDicomTags": {
    "PatientID": "12345",
    "PatientName": "DOE^JOHN",
    "PatientBirthDate": "19800101",
    "PatientSex": "M"
  },
  "Studies": [
    "660e8400-e29b-41d4-a716-446655440000"
  ],
  "Type": "Patient"
}
```

---

#### 3. Delete Patient

```http
DELETE /patients/{id}
Authorization: Bearer <token>
```

**Response:** `200 OK`

---

### Study Endpoints

#### 1. List All Studies

```http
GET /studies
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (int) - Max number of results
- `offset` (int) - Offset for pagination

**Response:** `200 OK`
```json
[
  "660e8400-e29b-41d4-a716-446655440000",
  "770e8400-e29b-41d4-a716-446655440001"
]
```

---

#### 2. Get Study Details

```http
GET /studies/{id}
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "ID": "660e8400-e29b-41d4-a716-446655440000",
  "ParentPatient": "550e8400-e29b-41d4-a716-446655440000",
  "MainDicomTags": {
    "StudyDate": "20240101",
    "StudyTime": "120000",
    "AccessionNumber": "ACC12345",
    "StudyDescription": "CT Chest"
  },
  "Series": [
    "880e8400-e29b-41d4-a716-446655440000"
  ],
  "Type": "Study"
}
```

---

#### 3. Anonymize Study

```http
POST /studies/{id}/anonymize
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "Replace": {
    "PatientName": "Anonymous",
    "PatientID": "ANONYMOUS"
  },
  "Keep": ["StudyDate"],
  "Remove": ["PatientBirthDate"]
}
```

**Response:** `200 OK`
```json
{
  "ID": "990e8400-e29b-41d4-a716-446655440000",
  "Type": "Study",
  "PatientID": "ANONYMOUS"
}
```

---

### Series Endpoints

#### 1. Get Series Details

```http
GET /series/{id}
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "ID": "880e8400-e29b-41d4-a716-446655440000",
  "ParentStudy": "660e8400-e29b-41d4-a716-446655440000",
  "MainDicomTags": {
    "Modality": "CT",
    "SeriesDescription": "Axial CT",
    "SeriesNumber": "1",
    "BodyPartExamined": "CHEST"
  },
  "Instances": [
    "990e8400-e29b-41d4-a716-446655440000"
  ],
  "Type": "Series"
}
```

---

#### 2. Get Series ZIP Archive

Download all instances in a series as ZIP.

```http
GET /series/{id}/archive
Authorization: Bearer <token>
```

**Response:** `200 OK`
- Content-Type: `application/zip`
- Body: ZIP file

---

### Instance Endpoints

#### 1. Get Instance Details

```http
GET /instances/{id}
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "ID": "990e8400-e29b-41d4-a716-446655440000",
  "ParentSeries": "880e8400-e29b-41d4-a716-446655440000",
  "MainDicomTags": {
    "SOPInstanceUID": "1.2.840.10008.1.1.1.1",
    "InstanceNumber": "1",
    "ImagePositionPatient": "-100.0\\-100.0\\-100.0"
  },
  "FileSize": 524288,
  "Type": "Instance"
}
```

---

#### 2. Download DICOM File

Download the DICOM file.

```http
GET /instances/{id}/file
Authorization: Bearer <token>
```

**Response:** `200 OK`
- Content-Type: `application/dicom`
- Body: DICOM file

---

#### 3. Render Preview Image

Get rendered PNG preview.

```http
GET /instances/{id}/preview
Authorization: Bearer <token>
```

**Query Parameters:**
- `quality` (int, 1-100) - JPEG quality (default: 90)

**Response:** `200 OK`
- Content-Type: `image/png`
- Body: PNG image

---

#### 4. Render Frame

Render a specific frame as image.

```http
GET /instances/{id}/frames/{frame}/preview
Authorization: Bearer <token>
```

**Query Parameters:**
- `quality` (int, 1-100) - JPEG quality
- `width` (int) - Resize width
- `height` (int) - Resize height

**Response:** `200 OK`
- Content-Type: `image/png`
- Body: PNG image

---

#### 5. Upload DICOM Instance

Upload a DICOM file.

```http
POST /instances
Authorization: Bearer <token>
Content-Type: application/dicom
```

**Body:** DICOM file binary

**Response:** `200 OK`
```json
{
  "ID": "990e8400-e29b-41d4-a716-446655440000",
  "ParentStudy": "660e8400-e29b-41d4-a716-446655440000",
  "Status": "Success"
}
```

---

## DICOMweb API

### Overview

DICOMweb provides RESTful access to DICOM data following the DICOM standard.

### Base URLs
```
Internal: http://localhost:8042/dicom-web
Through nginx: https://localhost/orthanc/dicom-web
```

### Authentication

Same as Orthanc REST API (Basic Auth or JWT Bearer Token).

### QIDO-RS (Query)

#### 1. Search for Studies

```http
GET /dicom-web/studies
Authorization: Bearer <token>
```

**Query Parameters:**
- `PatientID` - Filter by patient ID
- `PatientName` - Filter by patient name (supports wildcards *)
- `StudyDate` - Filter by study date (range: YYYYMMDD-YYYYMMDD)
- `Modality` - Filter by modality (CT, MR, XR, etc.)
- `AccessionNumber` - Filter by accession number
- `limit` (int) - Max results
- `offset` (int) - Pagination offset

**Example:**
```http
GET /dicom-web/studies?PatientName=DOE*&StudyDate=20240101-20241231
```

**Response:** `200 OK`
```json
[
  {
    "0020000D": {
      "vr": "UI",
      "Value": [
        "1.2.840.10008.1.1.1.1"
      ]
    },
    "00080020": {
      "vr": "DA",
      "Value": ["20240101"]
    },
    "00080030": {
      "vr": "TM",
      "Value": ["120000"]
    },
    "00080050": {
      "vr": "SH",
      "Value": ["ACC12345"]
    },
    "00080061": {
      "vr": "CS",
      "Value": ["CT"]
    },
    "00100020": {
      "vr": "LO",
      "Value": ["12345"]
    },
    "00100010": {
      "vr": "PN",
      "Value": [
        {
          "Alphabetic": "DOE^JOHN"
        }
      ]
    }
  }
]
```

---

#### 2. Get Series in Study

```http
GET /dicom-web/studies/{studyUID}/series
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
[
  {
    "0020000E": {
      "vr": "UI",
      "Value": ["1.2.840.10008.1.1.1.2"]
    },
    "00080060": {
      "vr": "CS",
      "Value": ["CT"]
    },
    "0008103E": {
      "vr": "LO",
      "Value": ["Axial CT"]
    }
  }
]
```

---

#### 3. Get Instances in Series

```http
GET /dicom-web/studies/{studyUID}/series/{seriesUID}/instances
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
[
  {
    "00080018": {
      "vr": "UI",
      "Value": ["1.2.840.10008.1.1.1.3"]
    },
    "00200013": {
      "vr": "IS",
      "Value": ["1"]
    }
  }
]
```

---

### WADO-RS (Retrieve)

#### 1. Retrieve Study Metadata

```http
GET /dicom-web/studies/{studyUID}/metadata
Authorization: Bearer <token>
```

**Response:** `200 OK`
- Content-Type: `application/dicom+json`
- Body: JSON metadata

---

#### 2. Retrieve Series Metadata

```http
GET /dicom-web/studies/{studyUID}/series/{seriesUID}/metadata
Authorization: Bearer <token>
```

**Response:** `200 OK`
- Content-Type: `application/dicom+json`

---

#### 3. Retrieve Instance DICOM

```http
GET /dicom-web/studies/{studyUID}/series/{seriesUID}/instances/{instanceUID}
Authorization: Bearer <token>
```

**Response:** `200 OK`
- Content-Type: `application/dicom`
- Body: DICOM file

---

#### 4. Retrieve Instance Metadata

```http
GET /dicom-web/studies/{studyUID}/series/{seriesUID}/instances/{instanceUID}/metadata
Authorization: Bearer <token>
```

**Response:** `200 OK`
- Content-Type: `application/dicom+json`

---

#### 5. Render Frame

```http
GET /dicom-web/studies/{studyUID}/series/{seriesUID}/instances/{instanceUID}/frames/{frameNumbers}
Authorization: Bearer <token>
```

**Query Parameters:**
- `quality` (int, 1-100) - JPEG quality

**Response:** `200 OK`
- Content-Type: `image/jpeg` or `image/png`
- Body: Image

---

### STOW-RS (Store)

#### 1. Store DICOM Instances

```http
POST /dicom-web/studies
Authorization: Bearer <token>
Content-Type: application/dicom
```

**Body:** DICOM file binary

**Response:** `200 OK`
```json
{
  "00081190": {
    "vr": "UI",
    "Value": ["1.2.840.10008.1.1.1.1"]
  }
}
```

---

## Error Codes

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 415 | Unsupported Media Type |
| 503 | Service Unavailable |

### Error Response Format

```json
{
  "error": "Error message description",
  "details": {
    "field": "Additional details"
  }
}
```

---

## Rate Limiting

### nginx Rate Limits

Through nginx reverse proxy:
- **30 requests/second** with burst capacity of 10
- Exceeding limit returns `503 Service Unavailable`

### Auth Service

No rate limiting currently (can be added in production).

---

## Examples

### Complete Workflow Example

```bash
# 1. Register a new user
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "radiologist1",
    "email": "radio@hospital.com",
    "password": "secure_password",
    "role": "radiologist"
  }'

# 2. Login to get tokens
RESPONSE=$(curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "radiologist1", "password": "secure_password"}')

# Extract access token (requires jq)
TOKEN=$(echo $RESPONSE | jq -r '.access_token')

# 3. List all patients using JWT
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8042/patients

# 4. Get patient details
PATIENT_ID="550e8400-e29b-41d4-a716-446655440000"
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8042/patients/$PATIENT_ID

# 5. Search studies via DICOMweb
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8042/dicom-web/studies?PatientName=DOE*"

# 6. Get rendered image
INSTANCE_ID="990e8400-e29b-41d4-a716-446655440000"
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8042/instances/$INSTANCE_ID/preview \
  --output preview.png

# 7. Logout
REFRESH_TOKEN=$(echo $RESPONSE | jq -r '.refresh_token')
curl -X POST http://localhost:8000/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\": \"$REFRESH_TOKEN\"}"
```

---

### JavaScript/TypeScript Example

```typescript
interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

class PACSClient {
  private baseUrl: string;
  private authUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(baseUrl: string = 'http://localhost:8042', authUrl: string = 'http://localhost:8000') {
    this.baseUrl = baseUrl;
    this.authUrl = authUrl;
  }

  async login(username: string, password: string): Promise<void> {
    const response = await fetch(`${this.authUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data: LoginResponse = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
  }

  async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${this.authUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this.refreshToken })
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data: LoginResponse = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
  }

  private async request<T>(url: string, options?: RequestInit): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (response.status === 401) {
      // Try to refresh token
      await this.refreshAccessToken();
      // Retry with new token
      return this.request<T>(url, options);
    }

    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getPatients(): Promise<string[]> {
    return this.request<string[]>(`${this.baseUrl}/patients`);
  }

  async getPatient(patientId: string): Promise<any> {
    return this.request<any>(`${this.baseUrl}/patients/${patientId}`);
  }

  async searchStudies(query: Record<string, string>): Promise<any[]> {
    const params = new URLSearchParams(query).toString();
    return this.request<any[]>(`${this.baseUrl}/dicom-web/studies?${params}`);
  }

  async getInstancePreview(instanceId: string): Promise<Blob> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${this.baseUrl}/instances/${instanceId}/preview`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }

    return response.blob();
  }
}

// Usage
const client = new PACSClient();
await client.login('radiologist1', 'secure_password');

const patients = await client.getPatients();
console.log('Patients:', patients);

const studies = await client.searchStudies({ PatientName: 'DOE*' });
console.log('Studies:', studies);
```

---

### Python Example

```python
import requests
from typing import List, Dict, Any, Optional

class PACSClient:
    def __init__(self, base_url: str = 'http://localhost:8042',
                 auth_url: str = 'http://localhost:8000'):
        self.base_url = base_url
        self.auth_url = auth_url
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None

    def login(self, username: str, password: str) -> None:
        """Login and get tokens"""
        response = requests.post(
            f'{self.auth_url}/auth/login',
            json={'username': username, 'password': password}
        )
        response.raise_for_status()

        data = response.json()
        self.access_token = data['access_token']
        self.refresh_token = data['refresh_token']

    def refresh_access_token(self) -> None:
        """Refresh access token"""
        if not self.refresh_token:
            raise ValueError('No refresh token available')

        response = requests.post(
            f'{self.auth_url}/auth/refresh',
            json={'refresh_token': self.refresh_token}
        )
        response.raise_for_status()

        data = response.json()
        self.access_token = data['access_token']
        self.refresh_token = data['refresh_token']

    def _request(self, method: str, url: str, **kwargs) -> requests.Response:
        """Make authenticated request"""
        if not self.access_token:
            raise ValueError('Not authenticated')

        headers = kwargs.pop('headers', {})
        headers['Authorization'] = f'Bearer {self.access_token}'

        response = requests.request(method, url, headers=headers, **kwargs)

        if response.status_code == 401:
            # Try to refresh token
            self.refresh_access_token()
            # Retry with new token
            headers['Authorization'] = f'Bearer {self.access_token}'
            response = requests.request(method, url, headers=headers, **kwargs)

        response.raise_for_status()
        return response

    def get_patients(self) -> List[str]:
        """List all patients"""
        response = self._request('GET', f'{self.base_url}/patients')
        return response.json()

    def get_patient(self, patient_id: str) -> Dict[str, Any]:
        """Get patient details"""
        response = self._request('GET', f'{self.base_url}/patients/{patient_id}')
        return response.json()

    def search_studies(self, **params) -> List[Dict[str, Any]]:
        """Search studies via DICOMweb"""
        response = self._request('GET', f'{self.base_url}/dicom-web/studies',
                               params=params)
        return response.json()

    def get_instance_preview(self, instance_id: str, output_path: str) -> None:
        """Download instance preview image"""
        if not self.access_token:
            raise ValueError('Not authenticated')

        response = requests.get(
            f'{self.base_url}/instances/{instance_id}/preview',
            headers={'Authorization': f'Bearer {self.access_token}'}
        )
        response.raise_for_status()

        with open(output_path, 'wb') as f:
            f.write(response.content)

# Usage
client = PACSClient()
client.login('radiologist1', 'secure_password')

patients = client.get_patients()
print(f'Patients: {patients}')

studies = client.search_studies(PatientName='DOE*')
print(f'Studies: {studies}')

# Download preview
client.get_instance_preview('instance-id-here', 'preview.png')
```

---

## Additional Resources

- **Orthanc Book:** https://book.orthanc-server.com/
- **DICOMweb Standard:** https://www.dicomstandard.org/why/dicomweb
- **JWT Guide:** See `docs/jwt-authorization-guide.md`
- **Project Setup:** See `CLAUDE.md`

---

**Last Updated:** 2026-03-24
