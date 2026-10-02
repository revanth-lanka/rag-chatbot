import logging
import time

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.chat.provider import ProviderRequestError
from app.chat.schemas import ChatRequest, ChatResponse
from app.chat.service import ChatService
from app.db.session import AsyncSessionLocal

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


@router.post(
    "/ask",
    response_model=ChatResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_200_OK,
)
async def ask_question(
    payload: ChatRequest,
    request: Request,
) -> ChatResponse:
    request_arrival_perf = time.perf_counter()
    request_arrival_epoch = time.time()
    client_action_time = request.headers.get("x-client-action-time")
    client_dispatch_time = request.headers.get("x-client-dispatch-time")
    client_action_float = None
    client_dispatch_float = None
    try:
        client_action_float = float(client_action_time) if client_action_time else None
        client_dispatch_float = float(client_dispatch_time) if client_dispatch_time else None
    except (ValueError, TypeError):
        pass

    try:
        async with AsyncSessionLocal() as session:
            service = ChatService(session, reranker=request.app.state.chat_reranker)
            service.request_arrival_perf = request_arrival_perf
            service.request_arrival_epoch = request_arrival_epoch
            service.client_action_time = client_action_float
            service.client_dispatch_time = client_dispatch_float
            prepared_chat = await service.prepare_chat(payload)
    except ProviderRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error while preparing chat question.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error while preparing chat response.",
        ) from exc

    try:
        return await service.answer_prepared(prepared_chat, retrieval_mode=payload.retrieval_mode)
    except ProviderRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error while answering chat question.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error while generating the answer.",
        ) from exc


@router.post("/stream", status_code=status.HTTP_200_OK)
async def stream_answer(
    payload: ChatRequest,
    request: Request,
) -> StreamingResponse:
    request_arrival_perf = time.perf_counter()
    request_arrival_epoch = time.time()
    client_action_time = request.headers.get("x-client-action-time")
    client_dispatch_time = request.headers.get("x-client-dispatch-time")
    client_action_float = None
    client_dispatch_float = None
    try:
        client_action_float = float(client_action_time) if client_action_time else None
        client_dispatch_float = float(client_dispatch_time) if client_dispatch_time else None
    except (ValueError, TypeError):
        pass

    try:
        async with AsyncSessionLocal() as session:
            service = ChatService(session, reranker=request.app.state.chat_reranker)
            service.request_arrival_perf = request_arrival_perf
            service.request_arrival_epoch = request_arrival_epoch
            service.client_action_time = client_action_float
            service.client_dispatch_time = client_dispatch_float
            prepared_chat = await service.prepare_chat(payload)
    except ProviderRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error while preparing streaming chat response.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error while starting the stream.",
        ) from exc

    return StreamingResponse(
        service.stream_prepared(prepared_chat),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
