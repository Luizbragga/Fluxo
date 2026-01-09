import { SetMetadata } from '@nestjs/common';

export const SENSITIVE_KEY = 'sensitive_action';
export const Sensitive = () => SetMetadata(SENSITIVE_KEY, true);
