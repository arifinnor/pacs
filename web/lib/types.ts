export interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "radiologist" | "viewer";
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: "admin" | "radiologist" | "viewer";
  type: "access" | "refresh";
  iat: number;
  exp: number;
}

export interface Study {
  studyUID: string;
  patientName: string;
  patientID: string;
  studyDate: string;
  studyTime: string;
  modality: string;
  studyDescription: string;
  accessionNumber: string;
  numberOfSeries: string;
  numberOfInstances: string;
}

export interface Series {
  seriesUID: string;
  modality: string;
  seriesNumber: string;
  seriesDescription: string;
  instanceCount: string;
}

export interface OrthancStats {
  countPatients: number;
  countStudies: number;
  countSeries: number;
  countInstances: number;
  totalDiskSizeMB: string;
}
