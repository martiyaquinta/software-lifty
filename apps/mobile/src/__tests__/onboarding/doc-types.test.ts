import { toBackendDocType } from '../../utils/upload';

describe('toBackendDocType', () => {
  it('maps every base doc and side to the backend doc_type', () => {
    expect(toBackendDocType('drivers_license', 'front')).toBe('license_front');
    expect(toBackendDocType('drivers_license', 'back')).toBe('license_back');
    expect(toBackendDocType('vehicle_registration', 'front')).toBe('registration_front');
    expect(toBackendDocType('vehicle_registration', 'back')).toBe('registration_back');
    expect(toBackendDocType('vehicle_insurance', 'front')).toBe('insurance_front');
    expect(toBackendDocType('vehicle_insurance', 'back')).toBe('insurance_back');
    expect(toBackendDocType('background_check', 'front')).toBe('background_check_front');
    expect(toBackendDocType('background_check', 'back')).toBe('background_check_back');
  });
});
