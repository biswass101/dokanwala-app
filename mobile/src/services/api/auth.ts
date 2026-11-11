import type {
  AuthSessionResponse,
  AuthUserDto,
  DigitStyle,
  LanguageCode,
  ShopProfileDto,
} from '@dokanwala/shared';
import { unwrapApiGet, unwrapApiPost } from './client';

export interface RegisterPayload {
  shopNameBn: string;
  shopNameEn?: string;
  shopAddressBn?: string;
  ownerName: string;
  phone: string;
  password: string;
  pin?: string;
  preferredLanguage: LanguageCode;
  preferredDigitStyle: DigitStyle;
  deviceName?: string;
}

export interface LoginPayload {
  phone: string;
  password: string;
  deviceName?: string;
}

export interface PinLoginPayload {
  phone: string;
  pin: string;
  deviceName?: string;
}

export interface SetPinPayload {
  currentPassword: string;
  pin: string;
}

export const authApi = {
  register(payload: RegisterPayload): Promise<AuthSessionResponse> {
    return unwrapApiPost<AuthSessionResponse>('/auth/register', payload);
  },
  login(payload: LoginPayload): Promise<AuthSessionResponse> {
    return unwrapApiPost<AuthSessionResponse>('/auth/login', payload);
  },
  pinLogin(payload: PinLoginPayload): Promise<AuthSessionResponse> {
    return unwrapApiPost<AuthSessionResponse>('/auth/pin-login', payload);
  },
  logout(refreshToken?: string): Promise<{ loggedOut: boolean }> {
    return unwrapApiPost<{ loggedOut: boolean }>('/auth/logout', refreshToken ? { refreshToken } : {});
  },
  setPin(payload: SetPinPayload): Promise<{ user: AuthUserDto }> {
    return unwrapApiPost<{ user: AuthUserDto }>('/auth/pin', payload);
  },
  getMe(): Promise<{ user: AuthUserDto; shop: ShopProfileDto }> {
    return unwrapApiGet<{ user: AuthUserDto; shop: ShopProfileDto }>('/auth/me');
  },
};
