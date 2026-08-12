import { ApiProperty } from '@nestjs/swagger';

import { UserResponse } from './user.response';

export class AuthTokensResponse {
  @ApiProperty({ description: 'Short-lived bearer token for the Authorization header.' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque token, exchanged at /auth/refresh. Rotated on every use.' })
  refreshToken!: string;

  @ApiProperty({ description: 'Seconds until the access token expires.' })
  expiresIn!: number;

  @ApiProperty({ type: UserResponse })
  user!: UserResponse;
}
