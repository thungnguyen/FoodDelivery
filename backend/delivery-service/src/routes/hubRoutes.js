import express from 'express';
import { createHub, deleteHub, getHubById, listHubs, updateHub } from '../controllers/droneCenterController.js';

const router = express.Router();

router.get('/', listHubs);
router.get('/:id', getHubById);
router.post('/', createHub);
router.put('/:id', updateHub);
router.delete('/:id', deleteHub);

export default router;
