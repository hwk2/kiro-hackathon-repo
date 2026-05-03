/**
 * Data privacy integration tests — static analysis of source code.
 *
 * Verifies the privacy-first design by scanning source files and
 * package.json for patterns that would violate the local-only,
 * no-network, no-cloud, no-account requirements.
 *
 * These tests read actual source files using Node's `fs` module and
 * search for forbidden patterns. This catches violations at the code
 * level before they ever reach production.
 *
 * Requirements validated:
 * - ALL images captured by the Mobile_App SHALL be stored locally only.
 * - THE Mobile_App SHALL NOT require any user account, login, or registration.
 * - NO component SHALL transmit user data to any external server, cloud service, or third-party API.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Root of the mobile app source directory. */
const SRC_ROOT = path.resolve(__dirname, '..', '..');

/** Root of the mobile app project (contains package.json). */
const PROJECT_ROOT = path.resolve(SRC_ROOT, '..');

/**
 * Recursively collect all files under `dir` matching the given extensions.
 */
function collectFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .expo, and test directories for source scanning
      if (entry.name === 'node_modules' || entry.name === '.expo') continue;
      results.push(...collectFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }

  return results;
}

/** Read all source files (.ts, .tsx) under src/. */
function getAllSourceFiles(): string[] {
  return collectFiles(SRC_ROOT, ['.ts', '.tsx']);
}

/** Read all non-test source files under src/. */
function getNonTestSourceFiles(): string[] {
  return getAllSourceFiles().filter(
    (f) => !f.includes('__tests__') && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'),
  );
}

/**
 * Scan files for a regex pattern. Returns an array of matches with
 * file path, line number, and matched text.
 */
function scanFilesForPattern(
  files: string[],
  pattern: RegExp,
): Array<{ file: string; line: number; match: string }> {
  const hits: Array<{ file: string; line: number; match: string }> = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineMatches = lines[i].match(pattern);
      if (lineMatches) {
        hits.push({
          file: path.relative(PROJECT_ROOT, filePath),
          line: i + 1,
          match: lineMatches[0],
        });
      }
    }
  }

  return hits;
}

// ---------------------------------------------------------------------------
// No network calls
// ---------------------------------------------------------------------------

describe('No network calls', () => {
  it('source files do not contain fetch(), XMLHttpRequest, or axios calls', () => {
    const sourceFiles = getNonTestSourceFiles();
    expect(sourceFiles.length).toBeGreaterThan(0);

    // Match fetch(, new XMLHttpRequest, axios., axios(
    const networkCallPattern = /\bfetch\s*\(|new\s+XMLHttpRequest|axios[\s.(]/;
    const hits = scanFilesForPattern(sourceFiles, networkCallPattern);

    expect(hits).toEqual([]);
  });

  it('source files do not contain http:// or https:// URLs (except localhost)', () => {
    const sourceFiles = getNonTestSourceFiles();

    // Match http:// or https:// but exclude localhost and 127.0.0.1
    const urlPattern = /https?:\/\/(?!localhost|127\.0\.0\.1)/;
    const hits = scanFilesForPattern(sourceFiles, urlPattern);

    expect(hits).toEqual([]);
  });

  it('package.json does not include known network/cloud libraries', () => {
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    const forbiddenLibraries = [
      'axios',
      'node-fetch',
      'got',
      'superagent',
      'firebase',
      '@firebase',
      'aws-sdk',
      '@aws-sdk',
      '@sentry',
      'sentry',
      'analytics',
      '@segment',
      'mixpanel',
      'amplitude',
      '@amplitude',
      'bugsnag',
      '@bugsnag',
      'datadog',
      '@datadog',
      'newrelic',
    ];

    const found = Object.keys(allDeps).filter((dep) =>
      forbiddenLibraries.some(
        (forbidden) => dep === forbidden || dep.startsWith(forbidden + '/'),
      ),
    );

    expect(found).toEqual([]);
  });

  it('BLE transport uses only Bluetooth with no network fallback', () => {
    const transportPath = path.join(SRC_ROOT, 'utils', 'bleTransport.ts');
    const content = fs.readFileSync(transportPath, 'utf-8');

    // Should not contain any network fallback patterns
    const networkFallback = /WebSocket|fetch\s*\(|http:\/\/|https:\/\/|wifi|Wi-Fi|socket\.connect/i;
    expect(content).not.toMatch(networkFallback);

    // Should reference BLE/Bluetooth
    expect(content).toMatch(/ble|bluetooth/i);
  });
});

// ---------------------------------------------------------------------------
// No cloud storage
// ---------------------------------------------------------------------------

describe('No cloud storage', () => {
  it('source files do not reference cloud storage APIs', () => {
    const sourceFiles = getNonTestSourceFiles();

    const cloudPatterns =
      /firebase|FirebaseStorage|AWS\.S3|@aws-sdk\/client-s3|GoogleCloud|google-cloud|iCloud|CloudKit|@react-native-firebase/i;
    const hits = scanFilesForPattern(sourceFiles, cloudPatterns);

    expect(hits).toEqual([]);
  });

  it('AsyncStorage is the only persistence mechanism (local-only)', () => {
    const sourceFiles = getNonTestSourceFiles();

    // Verify AsyncStorage is used
    const asyncStoragePattern = /AsyncStorage/;
    const asyncStorageHits = scanFilesForPattern(sourceFiles, asyncStoragePattern);
    expect(asyncStorageHits.length).toBeGreaterThan(0);

    // Verify no remote-capable storage alternatives
    const remoteStoragePattern =
      /expo-secure-store|SecureStore|realm|@realm|watermelondb|@nozbe\/watermelondb|supabase|@supabase|amplify|@aws-amplify/i;
    const remoteHits = scanFilesForPattern(sourceFiles, remoteStoragePattern);

    expect(remoteHits).toEqual([]);
  });

  it('no expo-secure-store or other remote-capable storage is used', () => {
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    const remoteCapableStorage = [
      'expo-secure-store',
      '@react-native-firebase/storage',
      '@aws-amplify/storage',
      'realm',
      '@realm/react',
      '@nozbe/watermelondb',
      '@supabase/supabase-js',
    ];

    const found = Object.keys(allDeps).filter((dep) => remoteCapableStorage.includes(dep));

    expect(found).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// No user accounts
// ---------------------------------------------------------------------------

describe('No user accounts', () => {
  it('source files do not contain authentication patterns', () => {
    const sourceFiles = getNonTestSourceFiles();

    // Match common auth patterns — case-insensitive.
    // Use targeted patterns to avoid false positives from generic words
    // like "register a callback" in JSDoc comments.
    const authPatterns =
      /\b(login|signIn|signUp|signup|userRegist|registerUser|registerAccount|OAuth|JWT|jsonwebtoken|auth0|@auth0|cognito|firebase\.auth)\b/i;
    const hits = scanFilesForPattern(sourceFiles, authPatterns);

    expect(hits).toEqual([]);
  });

  it('App.tsx does not contain user account state', () => {
    const appPath = path.join(PROJECT_ROOT, 'App.tsx');
    const content = fs.readFileSync(appPath, 'utf-8');

    // Should not have user/account/auth state
    const accountStatePatterns =
      /\buserState\b|\buser\s*,\s*setUser\b|\bisLoggedIn\b|\bisAuthenticated\b|\bauthToken\b|\baccessToken\b|\brefreshToken\b|\bcurrentUser\b/;
    expect(content).not.toMatch(accountStatePatterns);

    // Should not import auth-related modules
    const authImportPatterns = /import.*(?:auth|login|session|token)/i;
    expect(content).not.toMatch(authImportPatterns);
  });
});

// ---------------------------------------------------------------------------
// Data stays local
// ---------------------------------------------------------------------------

describe('Data stays local', () => {
  it('all data flows are Bluetooth-only (bleTransport, bleScanner, blePermissions)', () => {
    const utilsDir = path.join(SRC_ROOT, 'utils');
    const utilFiles = collectFiles(utilsDir, ['.ts', '.tsx']);
    expect(utilFiles.length).toBeGreaterThan(0);

    // All BLE-related files should exist
    const expectedBleModules = [
      'bleTransport.ts',
      'bleScanner.ts',
      'blePermissions.ts',
    ];

    for (const moduleName of expectedBleModules) {
      const modulePath = path.join(utilsDir, moduleName);
      expect(fs.existsSync(modulePath)).toBe(true);
    }

    // No util file should contain WiFi/HTTP transport patterns
    const networkTransportPattern = /WiFiTransport|HttpTransport|WebSocketTransport|net\.connect|dgram/i;
    const hits = scanFilesForPattern(utilFiles, networkTransportPattern);

    expect(hits).toEqual([]);
  });

  it('encryption keys are stored locally only via AsyncStorage (blePairingStore)', () => {
    const storePath = path.join(SRC_ROOT, 'utils', 'blePairingStore.ts');
    const content = fs.readFileSync(storePath, 'utf-8');

    // Should use AsyncStorage for persistence
    expect(content).toMatch(/AsyncStorage/);

    // Should not send keys over the network
    const networkSendPattern = /fetch\s*\(|axios|http:\/\/|https:\/\/|WebSocket|upload/i;
    expect(content).not.toMatch(networkSendPattern);

    // Should store key material locally
    expect(content).toMatch(/sharedKey|secretKey|publicKey/i);
  });

  it('images are referenced by local file URIs only (file:// protocol)', () => {
    const sourceFiles = getNonTestSourceFiles();

    // Check that CapturedImage URIs use file:// or local paths
    // Scan for any remote image URL patterns in non-test source
    const remoteImagePattern = /https?:\/\/.*\.(jpg|jpeg|png|heic|gif|webp)/i;
    const hits = scanFilesForPattern(sourceFiles, remoteImagePattern);

    expect(hits).toEqual([]);

    // Verify the CapturedImage interface uses uri (local file reference)
    const appPath = path.join(PROJECT_ROOT, 'App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf-8');
    expect(appContent).toMatch(/uri:\s*string/);
  });
});
