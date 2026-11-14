import { Prisma, ReportStatus, UserType } from '@prisma/client';
import { Request, Response } from 'express';
import * as z from 'zod';
import { reportServices } from '../../services/report.service';
import { AppError } from '../../errors/app-error';
import { getMidiaExtension, getMidiaType } from '../../middlewares/multer';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// A localização é salva como "latitude, longitude"
function isValidLocation(value: string) {
    const parts = value.split(',').map((part) => part.trim());
    if (parts.length !== 2 || parts.some((part) => part === '')) return false;

    const [lat, lng] = parts.map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const baseReportSchema = z.object({
    description: z.string().trim().min(1).max(500),
    details: z.string().trim().min(1).max(5000),
    ocurrenceDate: z.coerce.date()
        // 1 dia de folga por causa de fuso horário
        .refine((date) => date.getTime() <= Date.now() + ONE_DAY_MS, { message: 'A data de ocorrência não pode ser no futuro' }),
    location: z.string().min(1).max(100),
    address: z.string().max(500).optional().nullable(),
    houseNumber: z.string().trim().max(20).optional(),
})

// O autor da denúncia vem sempre do token, nunca do corpo da requisição
const reportSchema = baseReportSchema.extend({
    location: baseReportSchema.shape.location.refine(isValidLocation, { message: 'Localização inválida' }),
    anonymous: z.string().optional(),
})

// removedMidia é um JSON com os ids das mídias a remover
const editReportSchema = baseReportSchema.extend({
    removedMidia: z.string().optional()
        .transform((string, ctx) => {
            if (!string) return []
            try {
                return JSON.parse(string)
            } catch {
                ctx.addIssue({ code: 'custom', message: 'JSON inválido' })
                return z.NEVER
            }
        })
        .pipe(z.array(z.number().int()).max(100))
})

const filtersSchema = z.object({
    status: z.preprocess(emptyToUndefined, z.enum(ReportStatus).optional()),
    search: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
    dateFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
    dateTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
})

const rejectSchema = z.object({
    reason: z.string().trim().min(1).max(1000),
})

// Status que a ONG responsável pode definir pelo andamento da denúncia
const NGO_STATUSES: ReportStatus[] = [ReportStatus.IN_PROGRESS, ReportStatus.RESOLVED, ReportStatus.UNRESOLVED];

const statusSchema = z.object({
    statusComment: z.string().trim().min(1).max(2000),
})

function getAuthUser(req: Request) {
    const { sub, type } = (req as any).user;
    return { id: Number(sub), type: type as UserType };
}

function getReportId(req: Request) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError("INVALID_ID", 400);
    return id;
}

function getMidiaData(req: Request) {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    // Tipo e extensão vêm do nome gerado pelo servidor (extensão validada no upload)
    return files.map((file) => ({
        type: getMidiaType(file.filename),
        extension: getMidiaExtension(file.filename),
        url: `/images/${file.filename}`,
    }))
}

export async function register(req: Request, res: Response) {
    const user = getAuthUser(req);
    const parsed = reportSchema.parse(req.body)
    const midiaData = getMidiaData(req)

    if (!midiaData.some((file) => file.type === "image") || !midiaData.some((file) => file.type === "video")) {
        throw new AppError("IMAGE_AND_VIDEO_REQUIRED", 400);
    }

    const data: Prisma.ReportCreateInput = {
        description: parsed.description,
        details: parsed.details,
        location: parsed.location,
        address: parsed.address || null,
        houseNumber: parsed.houseNumber || null,
        ocurrenceDate: parsed.ocurrenceDate,
        status: ReportStatus.PENDING,
        user: parsed.anonymous === 'true' ? undefined : { connect: { id: user.id } },
        midia: {
            create: midiaData
        },
    }

    const { report } = await reportServices.register(data)

    return res.status(201).json({
        report
    });

}

export async function getMyReports(req: Request, res: Response) {
    const user = getAuthUser(req);
    const filters = filtersSchema.parse(req.query);

    const reports = await reportServices.findByUser(user.id, user.type, filters)

    res.status(200).json(reports)
}

export async function getPendingReports(req: Request, res: Response) {
    const reports = await reportServices.getPendingReports();
    return res.status(200).json(reports);
}

export async function sendReportToReview(req: Request, res: Response) {
    const user = getAuthUser(req);
    const reportId = getReportId(req);

    await reportServices.sendReportToReview(reportId, user.id);
    return res.status(200).send();
}

export async function rejectReport(req: Request, res: Response) {
    const reportId = getReportId(req);
    const { reason } = rejectSchema.parse(req.body);

    await reportServices.rejectReport(reportId, reason);
    return res.status(200).send();
}

export async function addNgoMidia(req: Request, res: Response) {
    const user = getAuthUser(req);
    const reportId = getReportId(req);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    const report = await reportServices.addNgoMidia(reportId, user.id, files);
    return res.status(201).json(report);
}

export async function edit(req: Request, res: Response) {
    const user = getAuthUser(req);
    const id = getReportId(req);
    const parsed = editReportSchema.parse(req.body)

    const exists = await reportServices.findById(id)
    if (!exists) throw new AppError("NOT_FOUND", 404)
    // Só o próprio denunciante edita a denúncia
    if (exists.userId !== user.id) throw new AppError("FORBIDDEN", 403)
    if (exists.status !== ReportStatus.PENDING && exists.status !== ReportStatus.REJECTED) throw new AppError("FORBIDDEN", 403)
    // Denúncias antigas podem ter um texto livre na localização; só valida se ela foi alterada
    if (parsed.location !== exists.location && !isValidLocation(parsed.location)) {
        throw new AppError("INVALID_LOCATION", 400)
    }

    const midiaData = getMidiaData(req)
    const removedMidia = await reportServices.findRemovableMidia(id, parsed.removedMidia)

    const data: Prisma.ReportUpdateInput = {
        description: parsed.description,
        details: parsed.details,
        location: parsed.location,
        address: parsed.address || null,
        houseNumber: parsed.houseNumber || null,
        ocurrenceDate: parsed.ocurrenceDate,
        midia: {
            create: midiaData,
            deleteMany: { id: { in: removedMidia.map(item => item.id) } }
        },
        status: 'PENDING'
    }

    const report = await reportServices.edit(id, data)

    reportServices.deleteMidiaFiles(removedMidia)
    res.status(200).json(report)
}

export async function exclude(req: Request, res: Response) {
    const user = getAuthUser(req);
    const id = getReportId(req)
    const report = await reportServices.findById(id);

    if (!report) throw new AppError("NOT_FOUND", 404)
    // Só o próprio denunciante exclui a denúncia
    if (report.userId !== user.id) throw new AppError("FORBIDDEN", 403)
    // Pendente ou rejeitada: depois que uma ONG assume, a denúncia não pode mais ser excluída
    if (report.status !== ReportStatus.PENDING && report.status !== ReportStatus.REJECTED) throw new AppError("FORBIDDEN", 403)

    await reportServices.exclude(id)

    return res.status(204).send()
}

export async function getReportById(req: Request, res: Response) {
    const user = getAuthUser(req);
    const id = getReportId(req);

    const report = await reportServices.findById(id);

    if (!report) throw new AppError("NOT_FOUND", 404);
    if (!reportServices.canView(report, user)) throw new AppError("FORBIDDEN", 403);

    return res.status(200).json(report);
}

export async function updateReportStatus(req: Request, res: Response) {
    const user = getAuthUser(req);
    const id = getReportId(req);
    const status = req.body?.status;

    if (!NGO_STATUSES.includes(status)) {
        throw new AppError("INVALID_STATUS", 400);
    }
    const { statusComment } = statusSchema.parse(req.body);

    const updatedReport = await reportServices.updateStatus(id, user.id, status, statusComment);

    return res.status(200).json(updatedReport);
}
