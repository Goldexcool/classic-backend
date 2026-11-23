import { BadRequestException, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadsService } from './uploads.service';
import type { UploadedImage } from './uploads.service';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Controller('tenants/:tenantSlug/uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('images')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!allowedTypes.has(file.mimetype)) return callback(new BadRequestException('Upload a JPG, PNG, or WebP image.'), false);
      callback(null, true);
    },
  }))
  uploadImage(
    @Param('tenantSlug') tenantSlug: string,
    @CurrentUser() user: { id: string },
    @UploadedFile() file: UploadedImage,
  ) {
    if (!file) throw new BadRequestException('Choose an image up to 8 MB.');
    return this.uploads.uploadImage(tenantSlug, user.id, file);
  }
}
