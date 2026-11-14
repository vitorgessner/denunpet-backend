import { Router } from 'express';
import { edit, exclude, getMyReports, getPendingReports, register, sendReportToReview, getReportById, updateReportStatus, rejectReport, addNgoMidia } from '../controllers/report/report.controller';
import { upload, uploadImages } from '../middlewares/multer';
import { authenticated } from '../middlewares/authenticated';
import { UserType } from '@prisma/client';

const router = Router();


router.get('/my', authenticated(), getMyReports);
router.get('/pending', authenticated(UserType.ONG), getPendingReports);
router.post("/register", upload.array("midia", 10), register)
router.get('/:id', authenticated(), getReportById);
router.put("/:id", authenticated(UserType.USER), upload.array("midia", 10), edit)
router.put("/:id/send-to-review", authenticated(UserType.ONG), sendReportToReview);
router.put("/:id/reject", authenticated(UserType.ONG), rejectReport)
router.put("/:id/status", authenticated(UserType.ONG), updateReportStatus);
router.post("/:id/midia", authenticated(UserType.ONG), uploadImages.array("midia", 10), addNgoMidia);
router.delete("/:id", authenticated(UserType.USER), exclude)
    
export default router;
