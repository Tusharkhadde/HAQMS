const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/reports/doctor-stats
router.get('/doctor-stats', authenticate, async (req, res) => {
  try {
    const start = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [doctors, allAppointments, todayQueueTokens] = await Promise.all([
      prisma.doctor.findMany(),
      prisma.appointment.findMany({ select: { doctorId: true, status: true } }),
      prisma.queueToken.findMany({
        where: { createdAt: { gte: today } },
        select: { doctorId: true },
      }),
    ]);

    const appointmentStatsByDoctor = allAppointments.reduce((acc, app) => {
      if (!acc[app.doctorId]) {
        acc[app.doctorId] = { totalAppointments: 0, completedAppointments: 0, cancelledAppointments: 0 };
      }

      acc[app.doctorId].totalAppointments += 1;
      if (app.status === 'COMPLETED') acc[app.doctorId].completedAppointments += 1;
      if (app.status === 'CANCELLED') acc[app.doctorId].cancelledAppointments += 1;
      return acc;
    }, {});

    const queueCountByDoctor = todayQueueTokens.reduce((acc, token) => {
      acc[token.doctorId] = (acc[token.doctorId] || 0) + 1;
      return acc;
    }, {});

    const reportData = doctors.map((doc) => {
      const stats = appointmentStatsByDoctor[doc.id] || {
        totalAppointments: 0,
        completedAppointments: 0,
        cancelledAppointments: 0,
      };

      return {
        id: doc.id,
        name: doc.name,
        specialization: doc.specialization,
        department: doc.department,
        totalAppointments: stats.totalAppointments,
        completedAppointments: stats.completedAppointments,
        cancelledAppointments: stats.cancelledAppointments,
        todayQueueSize: queueCountByDoctor[doc.id] || 0,
        revenue: stats.completedAppointments * doc.consultationFee,
      };
    });

    const durationMs = Date.now() - start;

    res.json({
      success: true,
      timeTakenMs: durationMs,
      data: reportData,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate report', details: error.message });
  }
});

module.exports = router;
